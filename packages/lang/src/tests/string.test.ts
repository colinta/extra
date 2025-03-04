import * as Types from '../types'

describe('length assertions', () => {
  it('lengthLessThan', () => {
    expect(Types.StringType.lengthLessThan(-1)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthLessThan(-1)).toMatchObject(Types.NeverType)
    expect(Types.StringType.lengthLessThan(0)).toMatchObject(Types.NeverType)
    expect(Types.StringType.lengthLessThan(1)).toMatchObject(new Types.LiteralStringType(''))
    expect(Types.StringType.lengthLessThan(5)).toMatchObject({
      narrowedString: {length: {min: 0, max: 4}},
    })
  })

  it('lengthLessOrEqual', () => {
    expect(Types.StringType.lengthLessOrEqual(-1)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthLessOrEqual(-1)).toMatchObject(Types.NeverType)
    expect(Types.StringType.lengthLessOrEqual(0)).toMatchObject(new Types.LiteralStringType(''))
    expect(Types.StringType.lengthLessOrEqual(1)).toMatchObject({
      narrowedString: {length: {min: 0, max: 1}},
    })
    expect(Types.StringType.lengthLessOrEqual(5)).toMatchObject({
      narrowedString: {length: {min: 0, max: 5}},
    })
  })

  it('lengthGreaterThan', () => {
    expect(Types.StringType.lengthGreaterThan(-1)).toBe(Types.StringType)
  })
  it('lengthGreaterThan', () => {
    expect(Types.StringType.lengthGreaterThan(0)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthGreaterThan(-1)).toBe(Types.StringType)
    expect(Types.StringType.lengthGreaterThan(0)).toMatchObject({
      narrowedString: {
        length: {
          min: 1,
          max: undefined,
        },
      },
    })
    expect(Types.StringType.lengthGreaterThan(1)).toMatchObject({
      narrowedString: {
        length: {
          min: 2,
          max: undefined,
        },
      },
    })
    expect(Types.StringType.lengthGreaterThan(5)).toMatchObject({
      narrowedString: {
        length: {
          min: 6,
          max: undefined,
        },
      },
    })
  })

  it('lengthGreaterOrEqual', () => {
    expect(Types.StringType.lengthGreaterOrEqual(1)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthGreaterOrEqual(-1)).toBe(Types.StringType)
    expect(Types.StringType.lengthGreaterOrEqual(0)).toBe(Types.StringType)
    expect(Types.StringType.lengthGreaterOrEqual(1)).toMatchObject({
      narrowedString: {
        length: {
          min: 1,
          max: undefined,
        },
      },
    })
    expect(Types.StringType.lengthGreaterOrEqual(5)).toMatchObject({
      narrowedString: {
        length: {
          min: 5,
          max: undefined,
        },
      },
    })
  })

  it('compound', () => {
    expect(Types.StringType.lengthLessThan(5).lengthGreaterOrEqual(2)).toMatchObject({
      narrowedString: {
        length: {
          min: 2,
          max: 4,
        },
      },
    })
    expect(Types.StringType.lengthLessOrEqual(5).lengthGreaterThan(2)).toMatchObject({
      narrowedString: {
        length: {
          min: 3,
          max: 5,
        },
      },
    })
    expect(Types.StringType.lengthLessOrEqual(15).lengthLessThan(5)).toMatchObject({
      narrowedString: {
        length: {
          min: 0,
          max: 4,
        },
      },
    })
    expect(Types.StringType.lengthGreaterThan(5).lengthGreaterOrEqual(15)).toMatchObject({
      narrowedString: {
        length: {
          min: 15,
          max: undefined,
        },
      },
    })
    expect(Types.StringType.lengthIs(5).lengthIsNot(5)).toBe(Types.NeverType)
  })

  it('lengthIs', () => {
    expect(Types.StringType.lengthIs(1)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthIs(-1)).toBe(Types.NeverType)
    expect(Types.StringType.lengthIs(0)).toEqual(Types.literal(''))
    expect(Types.StringType.lengthIs(1)).toMatchObject({narrowedString: {length: {min: 1, max: 1}}})
    expect(Types.StringType.lengthIs(5)).toMatchObject({narrowedString: {length: {min: 5, max: 5}}})
  })

  it('lengthIsNot', () => {
    expect(Types.StringType.lengthIsNot(0)).not.toBe(Types.StringType)

    expect(Types.StringType.lengthIsNot(-1)).toMatchObject(Types.StringType)
    expect(Types.StringType.lengthIsNot(0)).toMatchObject({
      narrowedString: {length: {min: 1, max: undefined}},
    })
    expect(Types.StringType.lengthIsNot(1)).toBe(Types.StringType)
    expect(Types.StringType.lengthIsNot(5)).toBe(Types.StringType)
  })
})
