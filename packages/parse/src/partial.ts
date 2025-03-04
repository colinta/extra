import {type Expected} from './expected'
import {createParser} from './create'
import type {Prettify, Parser} from './types'

export function partial<KA extends string, TA, TRemaining>(
  parsers: [[KA, Parser<TA>]],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<{
      [K in KA]: TA
    }>,
    TRemaining,
  ]
>

export function partial<KA extends string, TA, KB extends string, TB, TRemaining>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>]],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  TRemaining,
>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>], [KC, Parser<TC>]],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  TRemaining,
>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>], [KC, Parser<TC>], [KD, Parser<TD>]],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  KV extends string,
  TV,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
    [KV, Parser<TV>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      } & {
        [K in KV]: TV
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  KV extends string,
  TV,
  KW extends string,
  TW,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
    [KV, Parser<TV>],
    [KW, Parser<TW>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      } & {
        [K in KV]: TV
      } & {
        [K in KW]: TW
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  KV extends string,
  TV,
  KW extends string,
  TW,
  KX extends string,
  TX,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
    [KV, Parser<TV>],
    [KW, Parser<TW>],
    [KX, Parser<TX>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      } & {
        [K in KV]: TV
      } & {
        [K in KW]: TW
      } & {
        [K in KX]: TX
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  KV extends string,
  TV,
  KW extends string,
  TW,
  KX extends string,
  TX,
  KY extends string,
  TY,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
    [KV, Parser<TV>],
    [KW, Parser<TW>],
    [KX, Parser<TX>],
    [KY, Parser<TY>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      } & {
        [K in KV]: TV
      } & {
        [K in KW]: TW
      } & {
        [K in KX]: TX
      } & {
        [K in KY]: TY
      }
    >,
    TRemaining,
  ]
>

export function partial<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
  KE extends string,
  TE,
  KF extends string,
  TF,
  KG extends string,
  TG,
  KH extends string,
  TH,
  KI extends string,
  TI,
  KJ extends string,
  TJ,
  KK extends string,
  TK,
  KL extends string,
  TL,
  KM extends string,
  TM,
  KN extends string,
  TN,
  KO extends string,
  TO,
  KP extends string,
  TP,
  KQ extends string,
  TQ,
  KR extends string,
  TR,
  KS extends string,
  TS,
  KT extends string,
  TT,
  KU extends string,
  TU,
  KV extends string,
  TV,
  KW extends string,
  TW,
  KX extends string,
  TX,
  KY extends string,
  TY,
  KZ extends string,
  TZ,
  TRemaining,
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
    [KG, Parser<TG>],
    [KH, Parser<TH>],
    [KI, Parser<TI>],
    [KJ, Parser<TJ>],
    [KK, Parser<TK>],
    [KL, Parser<TL>],
    [KM, Parser<TM>],
    [KN, Parser<TN>],
    [KO, Parser<TO>],
    [KP, Parser<TP>],
    [KQ, Parser<TQ>],
    [KR, Parser<TR>],
    [KS, Parser<TS>],
    [KT, Parser<TT>],
    [KU, Parser<TU>],
    [KV, Parser<TV>],
    [KW, Parser<TW>],
    [KX, Parser<TX>],
    [KY, Parser<TY>],
    [KZ, Parser<TZ>],
  ],
  remaining: Parser<TRemaining>,
): Parser<
  [
    Prettify<
      {
        [K in KA]: TA
      } & {
        [K in KB]: TB
      } & {
        [K in KC]: TC
      } & {
        [K in KD]: TD
      } & {
        [K in KE]: TE
      } & {
        [K in KF]: TF
      } & {
        [K in KG]: TG
      } & {
        [K in KH]: TH
      } & {
        [K in KI]: TI
      } & {
        [K in KJ]: TJ
      } & {
        [K in KK]: TK
      } & {
        [K in KL]: TL
      } & {
        [K in KM]: TM
      } & {
        [K in KN]: TN
      } & {
        [K in KO]: TO
      } & {
        [K in KP]: TP
      } & {
        [K in KQ]: TQ
      } & {
        [K in KR]: TR
      } & {
        [K in KS]: TS
      } & {
        [K in KT]: TT
      } & {
        [K in KU]: TU
      } & {
        [K in KV]: TV
      } & {
        [K in KW]: TW
      } & {
        [K in KX]: TX
      } & {
        [K in KY]: TY
      } & {
        [K in KZ]: TZ
      }
    >,
    TRemaining,
  ]
>
/**/

export function partial(parsers: [string, Parser<any>][], remainingParser: Parser<any>) {
  const expectedObject: Expected = {
    type: 'object',
    of: parsers.map(([name, p]) => [name, p.expected]),
  }
  const expectedRemaining: Expected = remainingParser.expected

  let expected: Expected
  if (expectedRemaining.type === 'object') {
    expected = {type: 'object', of: expectedObject.of.concat(expectedRemaining.of)}
  } else {
    expected = {type: 'tuple', of: [expectedObject, expectedRemaining]}
  }

  return createParser(function partial(input: any, ok, err, Parser) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const partial: any = {}
      const visited = new Set<string>()
      for (const [key, parser] of parsers) {
        const result = parser(input[key])
        if (result.isOk()) {
          partial[key] = result.get()
        } else {
          return err(Parser, result.error.reason)
        }
        visited.add(key)
      }

      const remainingObject: any = {}
      for (const key of Object.keys(input)) {
        if (!Object.hasOwn(input, key) || visited.has(key)) {
          continue
        }

        remainingObject[key] = input[key]
      }

      return ok([partial, remainingParser(remainingObject).get()])
    } else {
      return err(Parser, 'not an object')
    }
  }, expected).named(
    `{${parsers.map(([name, p]) => `${name}: ${p.name}`).join(', ')}, ...${remainingParser.name}}`,
  )
}
