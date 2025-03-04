import {createParser} from './create'
import {reason, type Parser, ReasonError} from './types'

export function oneOf<TA>(parsers: [Parser<TA>]): Parser<TA>

export function oneOf<TA, TB = TA>(parsers: [Parser<TA>, Parser<TB>]): Parser<TA | TB>

export function oneOf<TA, TB = TA, TC = TB>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>],
): Parser<TA | TB | TC>

export function oneOf<TA, TB = TA, TC = TB, TD = TC>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>],
): Parser<TA | TB | TC | TD>

export function oneOf<TA, TB = TA, TC = TB, TD = TC, TE = TD>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>],
): Parser<TA | TB | TC | TD | TE>

export function oneOf<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>],
): Parser<TA | TB | TC | TD | TE | TF>

export function oneOf<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE, TG = TF>(
  parsers: [Parser<TA>, Parser<TB>, Parser<TC>, Parser<TD>, Parser<TE>, Parser<TF>, Parser<TG>],
): Parser<TA | TB | TC | TD | TE | TF | TG>

export function oneOf<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE, TG = TF, TH = TG>(
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
): Parser<TA | TB | TC | TD | TE | TF | TG | TH>

export function oneOf<TA, TB = TA, TC = TB, TD = TC, TE = TD, TF = TE, TG = TF, TH = TG, TI = TH>(
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
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO | TP>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO | TP | TQ>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
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
  ],
): Parser<TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO | TP | TQ | TR>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
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
  ],
): Parser<
  TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO | TP | TQ | TR | TS
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
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
): Parser<
  TA | TB | TC | TD | TE | TF | TG | TH | TI | TJ | TK | TL | TM | TN | TO | TP | TQ | TR | TS | TT
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
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
): Parser<
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
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
): Parser<
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
  | TV
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
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
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
  | TV
  | TW
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
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
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
  | TV
  | TW
  | TX
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
  TY = TX,
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
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
  | TV
  | TW
  | TX
  | TY
>

export function oneOf<
  TA,
  TB = TA,
  TC = TB,
  TD = TC,
  TE = TD,
  TF = TE,
  TG = TF,
  TH = TG,
  TI = TH,
  TJ = TI,
  TK = TJ,
  TL = TK,
  TM = TL,
  TN = TM,
  TO = TN,
  TP = TO,
  TQ = TP,
  TR = TQ,
  TS = TR,
  TT = TS,
  TU = TT,
  TV = TU,
  TW = TV,
  TX = TW,
  TY = TX,
  TZ = TY,
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
  | TA
  | TB
  | TC
  | TD
  | TE
  | TF
  | TG
  | TH
  | TI
  | TJ
  | TK
  | TL
  | TM
  | TN
  | TO
  | TP
  | TQ
  | TR
  | TS
  | TT
  | TU
  | TV
  | TW
  | TX
  | TY
  | TZ
>

/**/
export function oneOf<T, TIn = unknown>(parsers: Parser<any>[]): Parser<T, TIn>

export function oneOf(parsers: Parser<any>[]) {
  return createParser(
    function oneOf(input: any, ok, err, Parser): any {
      const failures: ReasonError[] = []
      for (const parser of parsers) {
        const result = parser(input)
        if (result.isOk()) {
          return result
        } else {
          failures.push(result.error)
        }
      }

      return err(reason(Parser, `none of the expected types matched`, failures))
    },
    {type: 'oneOf', of: parsers.map(p => p.expected)},
  ).named(parsers.map(p => p.name).join(' | '))
}
