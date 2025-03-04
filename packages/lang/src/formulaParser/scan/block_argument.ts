import {Scanner} from '../scanner'
import {scanValidName} from './identifier'

// scans a ref, treating named-"blocks" as operators
// e.g.
//     if (foo) then: bar
export function scanNamedBlockOperator(scanner: Scanner) {
  const ref = scanValidName(scanner)
  scanner.scanAllWhitespace()
  scanner.expectString(':')
  return ref
}
