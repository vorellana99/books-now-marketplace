import { Specification } from '../../src/contexts/sales/domain/shared/specification.js';

class IsEven extends Specification<number> {
  isSatisfiedBy(n: number): boolean {
    return n % 2 === 0;
  }
}
class IsPositive extends Specification<number> {
  isSatisfiedBy(n: number): boolean {
    return n > 0;
  }
}

describe('Specification', () => {
  const even = new IsEven();
  const positive = new IsPositive();

  it('evalúa la regla base', () => {
    expect(even.isSatisfiedBy(2)).toBe(true);
    expect(even.isSatisfiedBy(3)).toBe(false);
  });

  it('and exige las dos', () => {
    const both = even.and(positive);
    expect(both.isSatisfiedBy(4)).toBe(true);
    expect(both.isSatisfiedBy(-4)).toBe(false);
    expect(both.isSatisfiedBy(3)).toBe(false);
  });

  it('or exige al menos una', () => {
    const either = even.or(positive);
    expect(either.isSatisfiedBy(-4)).toBe(true);
    expect(either.isSatisfiedBy(3)).toBe(true);
    expect(either.isSatisfiedBy(-3)).toBe(false);
  });

  it('not invierte la regla', () => {
    expect(even.not().isSatisfiedBy(3)).toBe(true);
    expect(even.not().isSatisfiedBy(2)).toBe(false);
  });

  it('se pueden componer', () => {
    const oddOrNegative = even.not().or(positive.not());
    expect(oddOrNegative.isSatisfiedBy(3)).toBe(true);
    expect(oddOrNegative.isSatisfiedBy(-2)).toBe(true);
    expect(oddOrNegative.isSatisfiedBy(2)).toBe(false);
  });

  it('no modifica las reglas originales', () => {
    even.and(positive);
    even.not();
    expect(even.isSatisfiedBy(-2)).toBe(true);
  });
});
