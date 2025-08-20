import {createParser} from './create'
import type {Prettify, Parser, ReasonError} from './types'
import {reason} from './types'

export function object<KA extends string, TA>(
  parsers: [[KA, Parser<TA>]],
): Parser<
  Prettify<{
    [K in KA]: TA
  }>
>
export function object<KA extends string, TA, KB extends string, TB>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>]],
): Parser<
  Prettify<
    {
      [K in KA]: TA
    } & {
      [K in KB]: TB
    }
  >
>
export function object<KA extends string, TA, KB extends string, TB, KC extends string, TC>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>], [KC, Parser<TC>]],
): Parser<
  Prettify<
    {
      [K in KA]: TA
    } & {
      [K in KB]: TB
    } & {
      [K in KC]: TC
    }
  >
>
export function object<
  KA extends string,
  TA,
  KB extends string,
  TB,
  KC extends string,
  TC,
  KD extends string,
  TD,
>(
  parsers: [[KA, Parser<TA>], [KB, Parser<TB>], [KC, Parser<TC>], [KD, Parser<TD>]],
): Parser<
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
  >
>
export function object<
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
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
  ],
): Parser<
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
  >
>
export function object<
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
>(
  parsers: [
    [KA, Parser<TA>],
    [KB, Parser<TB>],
    [KC, Parser<TC>],
    [KD, Parser<TD>],
    [KE, Parser<TE>],
    [KF, Parser<TF>],
  ],
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
export function object<
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
): Parser<
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
  >
>
/**/
export function object<T, TIn = unknown>(parsers: [string, Parser<any>][]): Parser<T, TIn>

export function object(parsers: [string, Parser<any>][]) {
  return createParser(
    function object(input: any, ok, err, Parser: Parser<any>) {
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const object: any = {}
        const failures: ReasonError[] = []

        for (const [key, parser] of parsers) {
          const result = parser(input[key])
          if (result.isOk()) {
            object[key] = result.get()
          } else {
            failures.push(result.error)
          }
        }

        if (failures.length) {
          return err(reason(Parser, `parser '${Parser.name}' failed`, failures))
        }

        return ok(object)
      } else {
        return err(Parser, 'not an object')
      }
    },
    {
      type: 'object',
      of: parsers.map(([name, parser]) => [name, parser.expected]),
    },
  ).named(`{${parsers.map(([name, parser]) => `${name}: ${parser.name}`).join(', ')}}`)
}
