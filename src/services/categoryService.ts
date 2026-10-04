import { Op } from 'sequelize';
import { CATEGORY_CATALOG, CATEGORY_IDS } from '../constants/categoryCatalog';
import { Category, UserCategoryPreference } from '../models';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

type CategoryAppearanceInput = {
  icon?: string | null;
  color?: string | null;
};

type CategoryCreateInput = CategoryAppearanceInput & {
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'SAVING';
  purposeType?: 'GENERAL' | 'SAVING' | 'INVESTMENT';
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type CategoryPatchInput = CategoryAppearanceInput & {
  name?: string;
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export const SYSTEM_CATEGORY_IMMUTABLE_MESSAGE = '기본 카테고리는 이름·아이콘·색상만 바꿀 수 있고 삭제할 수 없습니다.';

const plain = (category: any) => typeof category?.toJSON === 'function' ? category.toJSON() : category;

type Preference = { displayName: string | null; icon: string | null; color: string | null };

// Postgres "undefined_table": the UserCategoryPreference migration has not
// been applied yet, so every category simply shows its canonical values.
const isMissingPreferenceTable = (error: any) => (error?.parent?.code ?? error?.original?.code) === '42P01';
const PREFERENCE_UNAVAILABLE = 'CATEGORY_PREFERENCE_UNAVAILABLE';
const preferenceUnavailable = () => new AppError(PREFERENCE_UNAVAILABLE, '카테고리 이름·아이콘·색상 변경은 아직 준비 중이에요.', 503);

export class CategoryService {
  private catalogReady?: Promise<void>;

  private async ensureSystemCatalog() {
    if (!this.catalogReady) {
      this.catalogReady = (async () => {
        await Promise.all(CATEGORY_CATALOG.map((category) => Category.upsert({
          ...category,
          ownerUserId: null,
          sourceCategoryId: null,
          parentCategoryId: category.parentCategoryId ?? null,
          isActive: category.isActive ?? true,
        })));
        await Category.update(
          { isActive: false },
          { where: { ownerUserId: null, id: { [Op.notIn]: CATEGORY_CATALOG.map((category) => category.id) } } },
        );
      })();
    }
    try {
      await this.catalogReady;
    } catch (error) {
      this.catalogReady = undefined;
      throw error;
    }
  }

  private accessibleWhere(userId: string) {
    return { [Op.or]: [{ ownerUserId: null }, { ownerUserId: userId }] };
  }

  private async findAccessible(userId: string, categoryId: string) {
    await this.ensureSystemCatalog();
    return Category.findOne({ where: { id: categoryId, ...this.accessibleWhere(userId) } });
  }

  private async effectiveId(userId: string, categoryId: string) {
    const category = await Category.findByPk(categoryId);
    if (!category || category.get('ownerUserId')) return categoryId;
    const override = await Category.findOne({ where: { ownerUserId: userId, sourceCategoryId: categoryId } });
    return override?.get('id') ?? categoryId;
  }

  private async validateParent(userId: string, parentCategoryId: string | null | undefined, type: string, selfId?: string) {
    if (parentCategoryId === undefined || parentCategoryId === null) return null;
    if (parentCategoryId === selfId) throw new AppError('INVALID_CATEGORY_PARENT', 'A category cannot be its own parent', 400);
    const parent = await this.findAccessible(userId, parentCategoryId);
    if (!parent || !parent.get('isActive')) throw new AppError('INVALID_CATEGORY_PARENT', 'Parent category not found or inactive', 400);
    if (parent.get('parentCategoryId')) throw new AppError('CATEGORY_DEPTH_EXCEEDED', 'Categories can have at most one parent level', 400);
    if (parent.get('type') !== type) throw new AppError('CATEGORY_TYPE_MISMATCH', 'Parent and child category types must match', 400);
    return this.effectiveId(userId, parentCategoryId);
  }

  private async assertNoActiveChildren(userId: string, categoryId: string) {
    const childCount = await Category.count({ where: { parentCategoryId: categoryId, isActive: true, ...this.accessibleWhere(userId) } });
    if (childCount > 0) throw new AppError('CATEGORY_HAS_CHILDREN', 'Delete or deactivate child categories before deleting this category', 409);
  }

  private async preferencesFor(userId: string, categoryIds?: string[]) {
    try {
      const rows = await UserCategoryPreference.findAll({ where: { userId, ...(categoryIds ? { categoryId: categoryIds } : {}) } });
      return new Map<string, Preference>(rows.map((row: any) => {
        const item = plain(row);
        return [String(item.categoryId), { displayName: item.displayName ?? null, icon: item.icon ?? null, color: item.color ?? null }];
      }));
    } catch (error) {
      if (isMissingPreferenceTable(error)) return new Map<string, Preference>();
      throw error;
    }
  }

  // `name` is what the UI shows: the user's displayName over the canonical
  // name. `canonicalName` is the Category row's own name, which ids, the
  // budget plan and the notification parser keep using.
  private serialize(category: any, userId: string, overrideBySource: Map<string, string>, preference?: Preference) {
    const item = plain(category);
    const parentCategoryId = item.parentCategoryId ? overrideBySource.get(item.parentCategoryId) ?? item.parentCategoryId : null;
    return {
      ...item,
      name: preference?.displayName ?? item.name,
      canonicalName: item.name,
      icon: preference?.icon ?? null,
      color: preference?.color ?? null,
      isCustomized: Boolean(preference && (preference.displayName || preference.icon || preference.color)),
      parentCategoryId,
      isSystem: item.ownerUserId === null,
      isCustom: item.ownerUserId === userId,
      systemCategoryId: item.sourceCategoryId ?? null,
    };
  }

  private async serializeOne(category: any, userId: string) {
    const preferences = await this.preferencesFor(userId, [String(category.get('id'))]);
    return this.serialize(category, userId, new Map(), preferences.get(String(category.get('id'))));
  }

  // Merges [changes] into the user's preference row for the category and
  // drops the row once nothing is overridden. Always scoped to [userId].
  private async savePreference(userId: string, categoryId: string, changes: Partial<Preference>) {
    if (Object.values(changes).every((value) => value === undefined)) return;
    try {
      await this.writePreference(userId, categoryId, changes);
    } catch (error) {
      throw isMissingPreferenceTable(error) ? preferenceUnavailable() : error;
    }
  }

  private async writePreference(userId: string, categoryId: string, changes: Partial<Preference>) {
    const existing = await UserCategoryPreference.findOne({ where: { userId, categoryId } });
    const current = plain(existing) ?? {};
    const next: Preference = {
      displayName: changes.displayName === undefined ? current.displayName ?? null : changes.displayName,
      icon: changes.icon === undefined ? current.icon ?? null : changes.icon,
      color: changes.color === undefined ? current.color ?? null : changes.color,
    };
    const empty = !next.displayName && !next.icon && !next.color;
    if (existing && empty) await existing.destroy();
    else if (existing) await existing.update(next);
    else if (!empty) await UserCategoryPreference.create({ userId, categoryId, ...next });
  }

  async list(userId: string) {
    await this.ensureSystemCatalog();
    const [categories, overrides, preferences] = await Promise.all([
      Category.findAll({ where: { isActive: true, ...this.accessibleWhere(userId) }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
      Category.findAll({ where: { ownerUserId: userId, sourceCategoryId: { [Op.not]: null } }, attributes: ['id', 'sourceCategoryId'] }),
      this.preferencesFor(userId),
    ]);
    const overrideBySource = new Map<string, string>(overrides.map((category: any) => [String(category.get('sourceCategoryId')), String(category.get('id'))]));
    const hiddenSystemIds = new Set(overrideBySource.keys());
    return categories
      .filter((category: any) => category.get('ownerUserId') !== null || !hiddenSystemIds.has(String(category.get('id'))))
      .map((category: any) => this.serialize(category, userId, overrideBySource, preferences.get(String(category.get('id')))));
  }

  async tree(userId: string) {
    const categories = await this.list(userId);
    const nodes = new Map(categories.map((category: any) => [category.id, { ...category, children: [] as any[] }]));
    const roots: any[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentCategoryId ? nodes.get(node.parentCategoryId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(userId: string, input: CategoryCreateInput) {
    const { icon, color, ...fields } = input;
    const parentCategoryId = await this.validateParent(userId, input.parentCategoryId, input.type);
    const category = await Category.create({
      ...fields,
      id: newId(),
      ownerUserId: userId,
      sourceCategoryId: null,
      parentCategoryId,
      purposeType: input.purposeType ?? 'GENERAL',
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
    try {
      await this.savePreference(userId, String(category.get('id')), { icon, color });
    } catch (error) {
      // The category itself is saved; only its icon/color wait for the table.
      if ((error as AppError)?.code !== PREFERENCE_UNAVAILABLE) throw error;
    }
    return this.serializeOne(category, userId);
  }

  // System categories (ownerUserId null) are shared rows referenced by id
  // from the budget plan, reports, the notification parser and the 대분류
  // roll-up. A user only personalises how one looks (name/icon/color), which
  // goes to their UserCategoryPreference row; the Category row is never
  // written, re-parented, reordered or deactivated. The user's own categories
  // change in place (delete deactivates so their transactions keep them) and
  // keep their icon/color in the same preference table.
  async update(userId: string, categoryId: string, input: CategoryPatchInput) {
    const current = await this.findAccessible(userId, categoryId);
    if (!current) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    const currentData = plain(current);

    if (currentData.ownerUserId === null) {
      if (input.parentCategoryId !== undefined || input.sortOrder !== undefined || input.isActive !== undefined) {
        throw new AppError('SYSTEM_CATEGORY_IMMUTABLE', SYSTEM_CATEGORY_IMMUTABLE_MESSAGE, 403);
      }
      // Saving the canonical name back clears the rename.
      const displayName = input.name === undefined ? undefined : input.name === currentData.name ? null : input.name;
      await this.savePreference(userId, categoryId, { displayName, icon: input.icon, color: input.color });
      return this.serializeOne(current, userId);
    }
    if (currentData.ownerUserId !== userId) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);

    const parentCategoryId = await this.validateParent(userId, input.parentCategoryId === undefined ? currentData.parentCategoryId : input.parentCategoryId, currentData.type, categoryId);
    if (input.isActive === false && currentData.isActive) await this.assertNoActiveChildren(userId, categoryId);
    const category = await current.update({
      name: input.name === undefined ? currentData.name : input.name,
      parentCategoryId,
      sortOrder: input.sortOrder === undefined ? currentData.sortOrder : input.sortOrder,
      isActive: input.isActive === undefined ? currentData.isActive : input.isActive,
    });
    await this.savePreference(userId, categoryId, { icon: input.icon, color: input.color });
    return this.serializeOne(category, userId);
  }

  // 기본값으로 되돌리기: drops the user's override so the category shows its
  // canonical name, icon and color again. Only the caller's own row goes.
  async resetPreference(userId: string, categoryId: string) {
    const current = await this.findAccessible(userId, categoryId);
    if (!current) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    try {
      await UserCategoryPreference.destroy({ where: { userId, categoryId } });
    } catch (error) {
      if (!isMissingPreferenceTable(error)) throw error;
    }
    return this.serialize(current, userId, new Map());
  }

  async remove(userId: string, categoryId: string) {
    const current = await this.findAccessible(userId, categoryId);
    if (!current) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    return this.update(userId, categoryId, { isActive: false });
  }

  async resolveForUser(userId: string, categoryId: string) {
    await this.ensureSystemCatalog();
    const override = await Category.findOne({ where: { ownerUserId: userId, sourceCategoryId: categoryId } });
    if (!override) return categoryId;
    return override.get('isActive') ? override.get('id') : CATEGORY_IDS.EXPENSE_UNCLASSIFIED;
  }
}
