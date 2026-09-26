import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { CATEGORY_CATALOG, CATEGORY_IDS } from '../constants/categoryCatalog';
import { Category, FixedExpense, Transaction } from '../models';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

type CategoryCreateInput = {
  name: string;
  type: 'EXPENSE' | 'INCOME' | 'SAVING';
  purposeType?: 'GENERAL' | 'SAVING' | 'INVESTMENT';
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type CategoryPatchInput = {
  name?: string;
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

const plain = (category: any) => typeof category?.toJSON === 'function' ? category.toJSON() : category;

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

  private serialize(category: any, userId: string, overrideBySource: Map<string, string>) {
    const item = plain(category);
    const parentCategoryId = item.parentCategoryId ? overrideBySource.get(item.parentCategoryId) ?? item.parentCategoryId : null;
    return {
      ...item,
      parentCategoryId,
      isSystem: item.ownerUserId === null,
      isCustom: item.ownerUserId === userId,
      systemCategoryId: item.sourceCategoryId ?? null,
    };
  }

  async list(userId: string) {
    await this.ensureSystemCatalog();
    const [categories, overrides] = await Promise.all([
      Category.findAll({ where: { isActive: true, ...this.accessibleWhere(userId) }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
      Category.findAll({ where: { ownerUserId: userId, sourceCategoryId: { [Op.not]: null } }, attributes: ['id', 'sourceCategoryId'] }),
    ]);
    const overrideBySource = new Map<string, string>(overrides.map((category: any) => [String(category.get('sourceCategoryId')), String(category.get('id'))]));
    const hiddenSystemIds = new Set(overrideBySource.keys());
    return categories
      .filter((category: any) => category.get('ownerUserId') !== null || !hiddenSystemIds.has(String(category.get('id'))))
      .map((category: any) => this.serialize(category, userId, overrideBySource));
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
    const parentCategoryId = await this.validateParent(userId, input.parentCategoryId, input.type);
    const category = await Category.create({
      ...input,
      id: newId(),
      ownerUserId: userId,
      sourceCategoryId: null,
      parentCategoryId,
      purposeType: input.purposeType ?? 'GENERAL',
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    });
    return this.serialize(category, userId, new Map());
  }

  async update(userId: string, categoryId: string, input: CategoryPatchInput) {
    const current = await this.findAccessible(userId, categoryId);
    if (!current) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
    const currentData = plain(current);
    const parentCategoryId = await this.validateParent(userId, input.parentCategoryId === undefined ? currentData.parentCategoryId : input.parentCategoryId, currentData.type, categoryId);
    if (input.isActive === false && currentData.isActive) await this.assertNoActiveChildren(userId, categoryId);
    const values = {
      name: input.name === undefined ? currentData.name : input.name,
      parentCategoryId,
      sortOrder: input.sortOrder === undefined ? currentData.sortOrder : input.sortOrder,
      isActive: input.isActive === undefined ? currentData.isActive : input.isActive,
    };

    if (currentData.ownerUserId === userId) {
      const category = await current.update(values);
      return this.serialize(category, userId, new Map());
    }

    const category = await sequelize.transaction(async (transaction) => {
      const existingOverride = await Category.findOne({ where: { ownerUserId: userId, sourceCategoryId: categoryId }, transaction });
      const target = existingOverride
        ? await existingOverride.update(values, { transaction })
        : await Category.create({
            ...currentData,
            ...values,
            id: newId(),
            ownerUserId: userId,
            sourceCategoryId: categoryId,
          }, { transaction });
      await Transaction.update({ categoryId: target.get('id') }, { where: { userId, categoryId }, transaction });
      await FixedExpense.update({ categoryId: target.get('id') }, { where: { userId, categoryId }, transaction });
      return target;
    });
    return this.serialize(category, userId, new Map([[categoryId, String(category.get('id'))]]));
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
