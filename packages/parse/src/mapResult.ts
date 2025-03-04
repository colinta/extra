import {createParser} from './create'
import type {Parser, ParserResult, ReasonError} from './types'
import {reason} from './types'

export function mapResult<T, TA>(
  fn: (argA: TA) => ParserResult<T>,
  parsers: [Parser<TA>],
): Parser<T>

export function mapResult<T, TA, TB>(
  fn: (argA: TA, argB: TB) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>],
): Parser<T>

export function mapResult<T, TA, TB, TC>(
  fn: (argA: TA, argB: TB, argC: TC) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE, argF: TF) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE, argF: TF, argG: TG) => ParserResult<T>,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>, Parser<TG>],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
  ],
): Parser<T>

export function mapResult<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
  TV,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
    argV: TV,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
    Parser<TV>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
  TV,
  TW,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
    argV: TV,
    argW: TW,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
    Parser<TV>,
    Parser<TW>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
  TV,
  TW,
  TX,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
    argV: TV,
    argW: TW,
    argX: TX,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
    Parser<TV>,
    Parser<TW>,
    Parser<TX>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
  TV,
  TW,
  TX,
  TY,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
    argV: TV,
    argW: TW,
    argX: TX,
    argY: TY,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
    Parser<TV>,
    Parser<TW>,
    Parser<TX>,
    Parser<TY>,
  ],
): Parser<T>

export function mapResult<
  T,
  TA,
  TB,
  TC,
  TD,
  TE,
  TF,
  TG,
  TH,
  TI,
  TJ,
  TK,
  TL,
  TM,
  TN,
  TO,
  TP,
  TQ,
  TR,
  TS,
  TT,
  TU,
  TV,
  TW,
  TX,
  TY,
  TZ,
>(
  fn: (
    argA: TA,
    argB: TB,
    argC: TC,
    argD: TD,
    argE: TE,
    argF: TF,
    argG: TG,
    argH: TH,
    argI: TI,
    argJ: TJ,
    argK: TK,
    argL: TL,
    argM: TM,
    argN: TN,
    argO: TO,
    argP: TP,
    argQ: TQ,
    argR: TR,
    argS: TS,
    argT: TT,
    argU: TU,
    argV: TV,
    argW: TW,
    argX: TX,
    argY: TY,
    argZ: TZ,
  ) => ParserResult<T>,
  parsers: [
    Parser<TA>,
    Parser<TB>,
    Parser<TC>,
    Parser<TD>,
    Parser<TE>,
    Parser<TF>,
    Parser<TG>,
    Parser<TH>,
    Parser<TI>,
    Parser<TJ>,
    Parser<TK>,
    Parser<TL>,
    Parser<TM>,
    Parser<TN>,
    Parser<TO>,
    Parser<TP>,
    Parser<TQ>,
    Parser<TR>,
    Parser<TS>,
    Parser<TT>,
    Parser<TU>,
    Parser<TV>,
    Parser<TW>,
    Parser<TX>,
    Parser<TY>,
    Parser<TZ>,
  ],
): Parser<T>

/**/

export function mapResult<T>(
  fn: (...args: any[]) => ParserResult<T>,
  parsers: Parser<any>[],
): Parser<T> {
  return createParser(
    function map(input: any, _ok, err, Parser: Parser<T>) {
      const args: any[] = []
      const failures: ReasonError[] = []
      for (const parser of parsers) {
        const result = parser(input)
        if (result.isOk()) {
          args.push(result.get())
        } else {
          failures.push(result.error)
        }
      }

      if (failures.length) {
        return err(reason(Parser, `parser '${Parser.name}' failed`, failures))
      }

      return fn(...args)
    },
    {type: 'tuple', of: parsers.map(p => p.expected)},
  ).named(`${fn.name}<${parsers.map(p => p.name).join(', ')}>`)
}
