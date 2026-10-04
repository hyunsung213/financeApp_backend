import { userProfileSchema } from '../src/validators/schemas';

describe('userProfileSchema', () => {
  it('trims nickname', () => {
    expect(userProfileSchema.parse({ nickname: '  상훈  ' }).nickname).toBe('상훈');
  });

  it.each(['', '   '])('rejects empty nickname %j', (nickname) => {
    expect(() => userProfileSchema.parse({ nickname })).toThrow();
  });

  it('rejects null nickname', () => {
    expect(() => userProfileSchema.parse({ nickname: null })).toThrow();
  });

  it('rejects nickname longer than 20 characters', () => {
    expect(() => userProfileSchema.parse({ nickname: 'a'.repeat(21) })).toThrow();
  });

  it('keeps age/region-only updates working', () => {
    expect(userProfileSchema.parse({ age: 25, region: '광주' })).toEqual({ age: 25, region: '광주' });
  });

  it('still requires at least one field', () => {
    expect(() => userProfileSchema.parse({})).toThrow();
  });
});
