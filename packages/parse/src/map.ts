import {createParser} from './create'
import type {Parser, ReasonError} from './types'
import {reason} from './types'

export function map<T, TA>(fn: (argA: TA) => T, parsers: [Parser<TA>]): Parser<T>

export function map<T, TA, TB>(
  fn: (argA: TA, argB: TB) => T,
  parsers: [Parser<TA>, Parser<TB>],
): Parser<T>

export function map<T, TA, TB, TC>(
  fn: (argA: TA, argB: TB, argC: TC) => T,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>],
): Parser<T>

export function map<T, TA, TB, TC, TD>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD) => T,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>],
): Parser<T>

export function map<T, TA, TB, TC, TD, TE>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE) => T,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>],
): Parser<T>

export function map<T, TA, TB, TC, TD, TE, TF>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE, argF: TF) => T,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>],
): Parser<T>

export function map<T, TA, TB, TC, TD, TE, TF, TG>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE, argF: TF, argG: TG) => T,
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>, Parser<TG>],
): Parser<T>

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH>(
  fn: (argA: TA, argB: TB, argC: TC, argD: TD, argE: TE, argF: TF, argG: TG, argH: TH) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR>(
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
  ) => T,
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

export function map<T, TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS>(
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<
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
  ) => T,
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

export function map<T>(fn: (...args: any[]) => T, parsers: Parser<any>[]): Parser<T> {
  return createParser(
    function map(input: any, ok, err, Parser: Parser<T>) {
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

      return ok(fn(...args))
    },
    {type: 'tuple', of: parsers.map(p => p.expected)},
  ).named(`${fn.name}<${parsers.map(p => p.name).join(', ')}>`)
}
