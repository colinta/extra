import {createParser} from './create'
import {reason, type Parser, ReasonError} from './types'

export function tuple<TA>(parsers: [Parser<TA>]): Parser<[TA]>

export function tuple<TA, TB>(parsers: [Parser<TA>, Parser<TB>]): Parser<[TA, TB]>

export function tuple<TA, TB, TC>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>],
): Parser<[TA, TB, TC]>

export function tuple<TA, TB, TC, TD>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>],
): Parser<[TA, TB, TC, TD]>

export function tuple<TA, TB, TC, TD, TE>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>],
): Parser<[TA, TB, TC, TD, TE]>

export function tuple<TA, TB, TC, TD, TE, TF>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>],
): Parser<[TA, TB, TC, TD, TE, TF]>

export function tuple<TA, TB, TC, TD, TE, TF, TG>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>, Parser<TG>],
): Parser<[TA, TB, TC, TD, TE, TF, TG]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR]>

export function tuple<TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS>(
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS]>

export function tuple<
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS, TT]>

export function tuple<
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS, TT, TU]>

export function tuple<
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
): Parser<[TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS, TT, TU, TV]>

export function tuple<
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
): Parser<
  [TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS, TT, TU, TV, TW]
>

export function tuple<
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
): Parser<
  [TA, TB, TC, TD, TE, TF, TG, TH, TI, TJ, TK, TL, TM, TN, TO, TP, TQ, TR, TS, TT, TU, TV, TW, TX]
>

export function tuple<
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
): Parser<
  [
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
  ]
>

export function tuple<
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
): Parser<
  [
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
  ]
>

/**/

export function tuple(parsers: Parser<any>[]) {
  return createParser(
    function tuple(input: any, ok, err, Parser: Parser<any>) {
      if (!Array.isArray(input)) {
        return err(Parser, 'not an array')
      }

      if (input.length !== parsers.length) {
        return err(
          Parser,
          `not enough elements, expected ${parsers.length} but found ${input.length}`,
        )
      }

      const args: any[] = []
      const failures: ReasonError[] = []

      for (const index in parsers) {
        const parser = parsers[index]
        const value = input[index]
        const result = parser(value)
        if (result.isOk()) {
          args.push(result.get())
        } else {
          failures.push(result.error)
        }
      }

      if (failures.length) {
        return err(reason(Parser, `parser ${Parser.name} failed`, failures))
      }

      return ok(args)
    },
    {type: 'tuple', of: parsers.map(p => p.expected)},
  ).named(`(${parsers.map(p => p.name).join(', ')})`)
}
