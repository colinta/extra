export function stringSort(lhs: string, rhs: string) {
  const [lhsNumber, rhsNumber] = [precedingNumber(lhs), precedingNumber(rhs)]

  if (lhsNumber !== undefined) {
    if (rhsNumber !== undefined) {
      if (lhsNumber.number === rhsNumber.number) {
        return lhsNumber.rest.localeCompare(rhsNumber.rest)
      }

      const compare = lhsNumber.number - rhsNumber.number
      if (compare < 0) {
        return -1
      } else {
        return 1
      }
    }
    return -1
  } else if (rhsNumber !== undefined) {
    return 1
  }

  return lhs.localeCompare(rhs)
}

function precedingNumber(str: string): {number: number; rest: string} | undefined {
  const matchDecimal = str.match(/^((?:0[box])?[\de_]+)/m)
  if (matchDecimal) {
    let numberStr = matchDecimal[1]
    numberStr = numberStr.replaceAll('_', '')
    numberStr = numberStr.replace(/^0+(\d)/, '$1')
    const number = Number(numberStr)
    if (isNaN(number)) {
      return
    }

    const rest = str.slice(matchDecimal[1].length)
    return {number, rest}
  }
}
