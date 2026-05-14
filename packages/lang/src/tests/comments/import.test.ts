import {expectComments, expectNoComments, scanImport} from './helpers'

describe('ImportStatement comments', () => {
  it('attaches comments to aliased imports', () => {
    const importExpr = scanImport(`\
--comment0
import
  --comment1
  as --comment2
    --comment3
    FooBar --comment4
    --comment5
    from --comment6
      --comment7
      Foo --comment8
`)

    const importSource = importExpr.source
    const asName = importExpr.alias!

    expectComments(importExpr.precedingComments, 'comment0')
    expectComments(asName.precedingComments, 'comment1', 'comment2', 'comment3')
    expectComments(asName.followingComments, 'comment4', 'comment5')
    expectComments(importSource.precedingComments, 'comment6', 'comment7')
    expectComments(importSource.followingComments, 'comment8')
    expect(importExpr.importSpecifiers).toEqual([])
    expectNoComments(importExpr.followingComments)
  })

  it('prints comments on aliased imports', () => {
    const importExpr = scanImport(`\
--comment0
import
  --comment1
  as --comment2
    --comment3
    FooBar --comment4
    --comment5
    from --comment6
      --comment7
      Foo --comment8
`)

    expect(importExpr.toCode()).toEqual(`\
--comment0
import as --comment1
--comment2
--comment3
FooBar --comment4
 --comment5
 from --comment6
--comment7
Foo --comment8`)
  })

  it('attaches comments to specific imports', () => {
    const importExpr = scanImport(`\
--comment0
import
  --comment1
  { --comment2
    bar --comment3
    --comment4
    bux --comment5
      as --comment6
        --comment7
        buxx --comment8
    --comment9
  } --comment10
  from --comment11
    --comment12
    Foo --comment13
`)

    const importSource = importExpr.source
    const [bar, bux] = importExpr.importSpecifiers

    expectComments(importExpr.precedingComments, 'comment0')
    expectComments(importExpr.precedingSpecifierComments, 'comment1')

    expect(importExpr.importSpecifiers.length).toBe(2)
    expect(bar.name.name).toBe('bar')
    expectComments(bar.name.precedingComments, 'comment2')
    expectComments(bar.name.followingComments, 'comment3')

    expect(bux.name.name).toBe('bux')
    expectComments(bux.name.precedingComments, 'comment4')
    expectComments(bux.name.followingComments, 'comment5')
    expect(bux.alias?.name).toBe('buxx')
    expectComments(bux.alias?.precedingComments, 'comment6', 'comment7')
    expectComments(bux.alias?.followingComments, 'comment8')
    expectComments(bux.followingComments, 'comment9')

    expectComments(importSource.precedingComments, 'comment10', 'comment11', 'comment12')
    expectComments(importSource.followingComments, 'comment13')
    expectNoComments(importExpr.followingComments)
  })

  it('prints comments on specific imports', () => {
    const importExpr = scanImport(`\
--comment0
import
  --comment1
  { --comment2
    bar --comment3
    --comment4
    bux --comment5
      as --comment6
        --comment7
        buxx --comment8
    --comment9
  } --comment10
  from --comment11
    --comment12
    Foo --comment13
`)

    expect(importExpr.toCode()).toEqual(`\
--comment0
import --comment1
{
  --comment2
  bar --comment3
  --comment4
  bux --comment5
   as --comment6
  --comment7
  buxx --comment8
   --comment9
} from --comment10
--comment11
--comment12
Foo --comment13`)
  })
})
