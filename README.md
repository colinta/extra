## The Extra Programming Language

## TL;DR

`bun run repl`

Extra is a strongly-typed language and runtime that can be used to create
client-side applications (and other things, I suppose but it's aimed at
*frontend*). It's closest cousin is Elm, second cousin to React,
long-time-listener-first-time-caller to Svelte, and uncanny valley similarity to
TypeScript.

## OK, tell me moooore...

While Elm made good on the promise of being extremely well-reasoned, it was
painful, to me, to compose components that needed to track their own internal
state. Extra makes that really easy – but still explicit. While I was in there,
I figured it wouldn't hurt to add TypeScript's branch-based type refinements.
Might as well add Swift's `guard` expression, too... and JSX seems like a good
idea (but can we make it even more ergonomic?).

Extra will also feel familiar to React developers, but without the cognitive
dissonance of "let it render" and "prevent too many rerenders", and obviously
not the "this was your best idea?" mess that is hooks. Whenever someone says
"React is (declarative|functional|good|fine/not-a-mess)!" I die a little inside.

The big difference in Extra with all these frameworks is how views are
*updated*. Think spreadsheets instead of DOM diffing.

When you update a cell in a spreadsheet, the application is able to know exactly
what cells were depending on that cell. It can create a dependency graph of all
the downstream dependencies, including charts and pivot tables, triggers, etc,
and only update *what is needed*. This is eerily similar to the goal that React
and other virtual-dom-based frameworks attempted... but they work on a
"render-and-diff" model instead of "render-what-changed". Extra tries to change
that.

In Extra, your `<View/>` components create a runtime that is capable of
tracking atomic changes. Think "assign new string value" and "push to an array".
These atomic changes are handed to the components that were depending on that
value, and the changes are propogated to the corresponding view object (dom or
native view).

# I'm completely sold! But show me some more cool things nonetheless.

Before I jump into the application architecture, let's get to know Extra first.
Because on top of being a really interesting runtime, it's also a
pretty-darn-good™ programming language!

## Quick syntax primer

```extra
-- comments are hyphenated, like Ada and Lua
{- or nested like this -}
<-- also this! Finally you can *point* to things using comments.

-- `let` is a special language construct that assigns values to scope.
let
  name = "Extra"
  someNumber = 2 * 1 + 40
  fn format(# name: String, age: Int) =>
    "Hello, $name!"
in
  format(name, age: someNumber)


let
  max = 10
  -- hyphens are allowed in names
  -- functions close-over local variables (`max`)
  -- the return type `Boolean` is inferred
  fn is-divisible-by-3(num: Int) =>
    num % 3 == 0 and num < max

  -- curly brackets are required in `if` expressions, but they surround the entire
  -- expression. This is actually an "external argument" syntax that can be used to
  -- create your own DSLs
  evens = if (max == 10) {
  then:
    [2, 4, 6, 8, 10]
  elseif (max == 12):
    [2, 4, 6, 8, 10, 12]
  else:
    [2, 4, 6, 8, 10, 12, 14]
  }
  odds = [
    1   -- look ma, no commas!
    3
    5
    7

    -- alternative way to invoke 'if',
    -- including the elements using spread operator
    ... if (max <= 10, then: [9], else: [])

    -- even better, the  `onlyif` operator here is only allowed in arrays,
    -- dicts, and sets. 11 is only included if the condition is true
    11 onlyif max > 10
  ]
in
  [...evens, ...odds]
    .filter(is-divisible-by-3)
    .sort(by: fn(a, b) => b <=> a) --> [9, 6, 3]
  -- the pipe operator assigns the left-hand-side to the `#` symbol
  |> inspect('filter', #)  --> prints "[9, 6, 3]: [Int]" and returns that value
  -- but if you want to assign # to a name, you can use `=>`
  |> some-numbers => some-numbers.map(fn(num) => $num).join(',')

-- there's a JSX-like syntax built in.
<div>
  <h1>Hello, Extra!</h1>
  <p>-- some things change, like this is no longer a comment</p>
  <p>{- other things don't change, like this *is* a comment -}</p>
  <!-- this is an HTML comment, so it's preserved -->
</div>

-- arrays, dicts, sets, and objects support an inclusion operator `onlyif`
-- in this case, 'italic' is included in the array only if `@is-italic` is true
<p class=[
  'bold'
  'italic' onlyif @is-italic
]>Hello, World!</p>
```

# Now in no particular order, some language features of Extra

## Commas are optional

I've tried hard to make sure the language grammar can unambiguously determine whether you are still writing an expression, or starting a new one. This allows for arrays, function-arguments, and imports to have commas as optional.

```extra
[
  1
  2
  3
  -4

  -- here's where things get tricky. The space between '-' and '5' turns it
  -- into a subtraction operation, not negation.
  8
  - 5 -- equivalent to `8 - 5`
] --> [1, 2, 3, -4, 3]

{
  name: 'Extra'
  is-awesome: true
  awesome-level: 11
}

add-two-numbers(
  1
  2
) --> 3

import Math: {
  sqrt
  pow
} --> import `sqrt` and `pow` functions from the Math package
```

### Blocks and Lazy types

Arguments can be marked `lazy`, in which case they look like a value at the call-site, but are not evaluated until the parameter is invoked.

Arguments can also be provided *outside* of the function using two syntaxes:

```extra
-- "simple" argument
foo(): 1  --> same as foo(1), only supports one "outside" argument
foo() { 1 }  --> same as foo(1), supports any number of arguments, including named
foo() { 1, else: 2 }
```

Here is a function definition using `lazy` arguments:

```extra
fn doSomething<T>(condition: 1 | 2 | 3, one: lazy(T), two: lazy(T), three: lazy(T)) =>
  switch (condition) {
  case 1:
    one()
  case 2:
    two()
  case 3:
    three()
  }

-- usually you would call the function like this - "vanilla" extra code
doSomething(1, one: 1, two: 2, three: 3) --> 1

-- but the named arguments DSL allows this:
doSomething(1) {
  one: 1
  two: 2
  three: 3
} --> 1
```

## Pattern Matching

Obviously Extra supports pattern matching. `switch` is the most canonical way to group a bunch of matchers. This was hard so you better like it!

```
foo --> matches everything, assigns to 'foo'
_ --> same but ignore the value

1, 1...2.5 --> matches numbers and ranges
"foo" --> string literal
"<" <> tag <> ">"  --> prefixed/suffixed string (assigns middle to 'tag')

[] --> matches an empty array
[a, _, b] --> matches an array with exactly least 3 items
[a, ..., b] --> matches an array with at least 2 items, assigns the first to 'a', and the last to 'b'

.blue --> matches an enum case
.rgb(r,g,b) --> matches and assigns values
```

###### Numbers
```extra
-- number matching works on literals and ranges
switch (volume) {
case 0:
  'muted!?'
case 1..<2:
  'turn it up!'
case 2..<5:
  "that's enough"
else:
  `$volume is too loud`
}
```

###### Strings
```extra
-- strings can be matched against regexes, and will assign matches to named
-- capture groups, or you can match against a prefix and assign the remainder
switch (name) {
case /(?<first>\w+) (?<last>\w+)/:
  "Hello, $first $last!"
case "Bob " <> last:
  "Did you say Bab? Bab $last!?"
case _ <> "!":
  "Your name ends in an exclamation mark, wow, that's so cool 🙄"
else:
  "Hello, $name!"
}
```

###### Arrays
```extra
-- match specific lengths, or any length using the spread operator
switch (friends) {
case []:
  "Aww, I'll be your friend"
case [one-friend]:
  "$one-friend sounds like a great friend!"
case [first, last]:
  "Wow you know $first and $last!?"
case [first, _, last]:
  "Wow you know $first and $last!? And someone else, but I forgot their name."
case [...some, last]:
  "${some.join(", ")} and $last... that's too many friends."
}
```

###### Enums
```extra
enum Permission {
  .sudo
  .sure-why-not
  .readonly
}

switch (permission) {
case .sudo, .readonly:
  true
else:
  false
}
```

###### Objects
```extra
-- match named or positional arguments, and you can *nest* matchers, which makes
-- this really useful
fn permission(user: User): Permission =>
  switch (user) {
  case {role: .admin}:
    .sudo
  case {name: "Colin"}:
    .sure-why-not
  case {name: name, role: .staff}:
    .readonly(name)
  else:
    .none
  }
```

###### Putting it all together
```extra
-- input: String | Array(String)
switch (input) {
case 'foo' <> bar:
  bar -- bar: String, input: String (TODO: add 'prefix' info to String type)
case [onlyOne]:
  onlyOne  -- onlyOne: String, input: Array(String, length: =1)
case [...many, last]:
  many.join(',') <> " and $last"  -- many: Array(String), last: String, input: Array(String, length: >=1)
else:
  'not "foo…" or [a, …]'
}
```

### Enums / Algebraic data types

```extra
enum Result<Ok, Err> {
  .ok(Ok)
  .err(Err)

  fn to-maybe() =>
    switch (this) {
    case .ok(value): value
    else: null
    }

  static from-maybe<T>(# value: T?): Result<T, null> =>
    if (value, then: .ok(value), else: .err(null))
}

enum Colour {
  .rgb(r: Int(0..<256), g: Int(0..<256), b: Int(0..<256))
  .hex(String(length: =6))
  .name('red' | 'green' | 'blue')
}

switch (colour) {
case .rgb(r, g, b):
  "rgb($r, $g, $b)"
case .hex(hex):
  "hex(#$hex)"
case .name(name):
  "Colour named '$name'"
}
```

There is also a shorthand syntax, only available when defining an enum as an
argument type (you cannot use generics in that case):

```extra
fn print(
  # text: String
  color:
    -- initial '|' is optional, but looks nice in multilines
    | .rgb(r: Int(0..<256), g: Int(0..<256), b: Int(0..<256))
    | .hex(String(length: =6))
    | .name('red' | 'green' | 'blue')
    | null
) =>
  if (color) { then: … }
```

## Unambiguous operators

Minor thing: `+` is a mathematical operator that adds two numbers. Did you know that `a + b == b + a`? Except in Java and Javascript and Swift and many other languages. 🙄

`++` is a computer science-y looking operator that concatenates two arrays. `<>` does the same for strings.

Having distinct concatenation operators is either really nice for indicating intentionality, or an unnecessary distinction. I hate to side w/ PHP on this one, but I treat 'em differently. Or hey maybe I'm hitching my ride to PHP's weird and shocking resurgence!? Who knows!?

Words (`and` `or` `not` `is` `has`) are used for logical operators, but not bitwise operators (`&` `|` `^` `~`).

Actually `is` is the "match" operation (see "Destructured Matching"), ie `if (x is .some(val))` will attempt to match the two sides. The left-hand side is evaluated, and must match with the right-hand side (`.some(x) is x` will not compile). In this case, in the scope of the `then:` branch, `x` will have the unwrapped value of (if `x: Maybe<T>` and `x = .some(T)` then `val: T`).

## String coercion and interpolation

Extra's "coerce to String" function is a unary operator `$`, and it's also the string interpolation delimiter.

```extra
-- look at the beautiful similarity between String templates
-- and String coercion:

"How many: $n"
"How many: " <> $n

-- because it's an _operator_, you can do things like
[1, 2].join($(n + 1))
```

## Type guards aka Type refinements

You can provide much more type information to Arrays, Dicts, Sets, Strings, and Numbers. You can define types like "an Array of Ints, with at least one item, where each Int is greater than 0" (`[Int(>0), 1+]`).

In my mind, an "empty String/Array" is a different _type_ than "a String with 5 or more characters." And the reason they are different types is because there are often cases where I _know that I will need at least one of the thing_. For instance, a `name: String` variable. Would't it be nice if I could say `name: String(1+)`, indicating that it must have at least one letter? _Yes we can!_

```extra
String(length: =8)      -- String of exactly length 8
String(matches: /^\d!$/) -- String matching a regex
String(matches: [/^.\d+!$/, /^a/]) -- String matching multiple regexes

Int(<8)       -- any Int less than 8
Int(0...10)    -- any Int 0 to 10, inclusive
Float(0..<10) -- any Float greater than or equal to 0, less than 10
Float(-10<.<10) -- any Float greater than -10, less than 10

Int(=8)       -- this is just the literal number 8
Int(8...8)    -- so is this!
Int(7<.<9)    -- and this.
8             -- literals are also valid types

Array(Foo, length: >=3)     -- Array of type 'Foo' with at least 3 items
Array(Foo, length: <=3)     -- Array of Foo with 3 items or less
Array(Foo, length: =3)     -- Array of Foo with exactly 3 items

-- < <= >= > comparisons also work
Array(Foo, length: <=3)    -- array of Foo with no more than 3 items
Array(Foo, length: >3)     -- array of Foo with more than 3 items

-- and ranges
Array(Foo, length: 2...4)   -- array of Foo with 2, 3, or 4 items (inclusive range)
Array(Foo, length: 1<.<5) -- array of Foo with 2, 3, or 4 items (exclusive range)
Array(Foo, length: 2..<5) -- array of Foo with 2, 3, or 4 items (exclusive range)
Array(Foo, length: 2<..5) -- array of Foo with 3, or 5 items (exclusive range)

-- Dict / Maps
Dict(Foo, length: 3+)      -- dict of Foo with 3 or more items
Dict(Foo, length: 3...10)  -- dict of Foo with 3 to 10 items in it

Dict(Foo, keys: [key1:, key2:])  -- dict with specified keys - these keys must be present

Dict(Foo, keys: [key1:, key2:])  -- dict with specified keys - these keys must be present
Dict(Foo, keys: [key1:, key2:], length: 3+)  -- specified keys and length >= 3

-- these types can be combined:
Array(String(length: =8), length: =10) -- array of strings
      -- each string is 8 characters
                  -- and there are 10 of them in the array
Array(length: =10, String(=8)) -- if you prefer, these arguments can be rearranged
```

## Default value placeholder.

For situations where you are calling a function that offers a default value. Imagine a scenario where in _some_ cases you want to specify the argument, and in other cases you want to use the default.

I've chosen the name `fallback` for this value. `default` is the obvious choice, but I found myself wanting to use that name in argument lists, and so decided to make it something a little more esoteric/special.

### Case 1

You only want to specify 1st and 3rd positional arguments.

```extra
foo(1, fallback, 3)
```

This calls the function `foo` with the first and third arguments specified, but the second argument will _defer to the default value_. So simple, so handy. What _is_ the default value in this case? I dunno! Should I know? Do I look up the API for that? What if it changes?

### Case 2

If `b` is specified, use it, otherwise use the default.

```extra
let
  fn bar(# a: Int, # b: Int = 10) => a + b
  fn foo(# a: Int, # b: Int | null) =>
    bar(a, b ?? fallback)
in
[
  foo(1),    --> 11, default value of 10 is used
  foo(1, 1), --> 2
]
```

In other languages, in order to avoid hard-coding b's default value 10 you would
have to provide two separate calls to bar:

```extra
fn foo(# a: Int, # b: Int | null) =>
  if (b == null) {
  then:
    bar(a)
  else:
    bar(a, b)  -- 🤢
  }
```

It really shakes my pepper that this doesn't exist in more languages! How is this not a thing!? I've often felt that I wanted this. Maybe it's just me. 🤷‍♂️

## Pipe operator 🤓

I'm a big fan of pipes from Elm and Elixir. In these languages, the value entering the pipe is automatically inserted into the receiving function. I think that having a sigil represent where you want the value to go gives them even more flexibility. Slow approving nod to Hack for this idea.

I picked the `#` character, because it's also used in functions as a "positional argument" indicator. JS's proposal currently favors `^^` I think? 🤢 Why can't JS do anything right... and why don't they just _ask me_, since I seem to know all the answers.

```extra
'abc' |> # <> #
  --> 'abc' <> 'abc'
  --> 'abcabc'

-- extract two elements from an object, place them in an array
{a: 'a', b: 'b', c: 'c'} |> [#.a, #.b]
```

Also available is the "null coalescing pipe". If the value is `null`, it skips the pipe and returns `null`. Otherwise, invokes the pipe with the non-null value. Elm would call this `Maybe.map`. Haskell would call this - ok I had to look this up and I got confused so I don't know what Haskell would call this. `>>=` or maybe `<*$>`.

```
let
  fn example(# foo: String?) => foo ?|> # <> "!"
in
  [
    example('bang') --> 'bang!'
    example(null) --> null
  ]
```

You can place a bare "match" operator on the right hand side of the pipe operator and it will be invoked with the `#` value. This is a handy way to "name" the `#` value.

```extra
sum(numbers)
  |> sum =>
    if (sum > 10, then: 'big sum', else: 'small sum')
❌  |> a <> b => … you cannot use generic matchers here

name
  |> #.split(/\s+/)
  |> names =>
    names.map(fn(name) => name.capitalize())
  |> #.join(' ')

-- of course it's also just very easy to pipe into a `switch` statement
httpResponse |> switch(#) {
  case .ok(success):
    success.message
  case .err(error):
    error.message
  } --> String
```

## Algebraic data types _of course_

In particular: **Sum Types**. Shoutout to [Justin Pombrio – but please get out of my head and stealing my rants](https://justinpombrio.net/2021/03/11/algebra-and-data-types.html#:~:text=The%20Baffling%20Lack%20of%20Sum%20Types) for a great writeup on Sum and Product types.

```extra
enum RemoteData<Success, Failure> {
  .notAsked
  .loading
  .failure(error: Failure)
  .success(value: Success)

  static maybe<S, F>(# value: S?): RemoteData(S, F) =>
    if (value, then: .success(value), else: .notAsked)

  fn data(): Success? =>
    switch(this) {
    case .success(value): value
    else:
      null
    }
}

let
  remoteData: RemoteData<String, Error> = .success('data loaded')
in
  remoteData.data() --> 'data loaded': String?
```

**Product Types** in Extra are the good ol' `Object` type – `Record` or `struct` in other languages. Extra Objects are also Tuples, because the property name is optional - you can have positional and named properties (which aligns them with how function arguments support positional and named arguments - function arguments are just Tuples (or Objects)!)

## Comments

I may have gone a bit overboard, just a heads up. 🤓

`-- line comment`
`{- block -}`
`{- block {- with nesting -} -}`
`--> arrow style line comment`
`<-- alternate arrow style line comment`
`← why stop there?` `→ pointing is rude though`

The usual comment characters `#` and `//` both have special meaning in Extra, and so I looked elsewhere for inspiration, and looked no further than Ada (and yes, Ada, Elm, Lua _all_ use `--` for line comments... but Ada has a certain caché so I wanted to mention it first).

**More examples**
```extra
-- this is a line comment
"no longer a comment"  <-- this is a statement (and this is a comment!)

{- comment block, line 1
 {- comment blocks _can_ be nested -}
comment, line 3 -}

-- Handy trick to comment/uncomment multiple lines easily:
{--}    <-- removing the '}' here will turn all four lines into a comment
multiple |>
  lines
--} <-- This brace is just part of a line comment until the '}' above is removed

--> arrows can be a comment! It's a small thing, but I find this so handy.
<-- so much so that I made `<--` a comment marker, too, and ← and →
```

## Extra Comments

This is maybe a little out of hand, but I like drawing boxes using old-school ASCII characters, so there's support for these as line-comment start characters.

All box-drawing characters _are also valid comments_ (U+2500 – U+257F).

```extra
╭────────╮
│  yup.  │  ┌─╴╴╴╴╴╴╼┓
╰────────╯  │go nuts!╿
            ╘════════╛
```

Here's the complete set, so you can copy/paste your favourites:

```
       0 1 2 3 4 5 6 7 8 9 A B C D E F
U+2500 ─ ━ │ ┃ ┄ ┅ ┆ ┇ ┈ ┉ ┊ ┋ ┌ ┍ ┎ ┏
U+2510 ┐ ┑ ┒ ┓ └ ┕ ┖ ┗ ┘ ┙ ┚ ┛ ├ ┝ ┞ ┟
U+2520 ┠ ┡ ┢ ┣ ┤ ┥ ┦ ┧ ┨ ┩ ┪ ┫ ┬ ┭ ┮ ┯
U+2530 ┰ ┱ ┲ ┳ ┴ ┵ ┶ ┷ ┸ ┹ ┺ ┻ ┼ ┽ ┾ ┿
U+2540 ╀ ╁ ╂ ╃ ╄ ╅ ╆ ╇ ╈ ╉ ╊ ╋ ╌ ╍ ╎ ╏
U+2550 ═ ║ ╒ ╓ ╔ ╕ ╖ ╗ ╘ ╙ ╚ ╛ ╜ ╝ ╞ ╟
U+2560 ╠ ╡ ╢ ╣ ╤ ╥ ╦ ╧ ╨ ╩ ╪ ╫ ╬ ╭ ╮ ╯
U+2570 ╰ ╱ ╲ ╳ ╴ ╵ ╶ ╷ ╸ ╹ ╺ ╻ ╼ ╽ ╾ ╿

┌─┬─┐ ╒═╤═╕ ╓─╥─╖ ╔═╦═╗
│ │ │ │ │ │ ║ ║ ║ ║ ║ ║
├─┼─┤ ╞═╪═╡ ╟─╫─╢ ╠═╬═╣
│ │ │ │ │ │ ║ ║ ║ ║ ║ ║
└─┴─┘ ╘═╧═╛ ╙─╨─╜ ╚═╩═╝

┍━┯━┑ ┎─┰─┒ ┏━┳━┓ ╭─┬─╮
│ │ │ ┃ ┃ ┃ ┃ ┃ ┃ │ │ │
┝━┿━┥ ┠─╂─┨ ┣━╋━┫ ├─┼─┤
│ │ │ ┃ ┃ ┃ ┃ ┃ ┃ │ │ │
┕━┷━┙ ┖─┸─┚ ┗━┻━┛ ╰─┴─╯
```

# More formal language Design

Lots of repetition here. The above is a whirlwind tour, now I'll try to be more precise.

## Let

`let` is how you can assign values to local ~variables~ scope. I'll use this in most examples below so I better define it first.

```extra
let
  the-answer = 42
  fn propose-answer(answer: Int): String => `The answer is $answer`
in
  propose-answer(answer: the-answer)
```

## Variable names

References can have hyphens like in Lisp (`valid-variable-name`), and emojis (`😎-languages = Set("extra")`).

## Basic Types

### Null

`null`

**Don't Panic!** Null safety is built-in, and "calling method on `null`" is prevented by the compiler (if it's not, [open an issue!](https://github.com/colinta/extra-lang/issues))

### Booleans

`true` and `false`

### Truthiness and the Conditional type

I went back and forth on having "truthy" types. Most functional languages are strict about what goes in an `if ()` expression - only Boolean is allowed.

But this makes the `and` and `or` operators much less useful as short-circuiting operations. For instance, imagine you want to provide a default error message:

```extra
let
  message = error.message or "Try that again please"
in
  …
```

I think the intention above is clear - and the below is no less clear, but at the expense of a ton of boilerplate.

```extra
let
  message = if (not error.message.isEmpty()) {
  then:
    error.message
  else:
    "Try that again please"
  }
```

And so, Extra has "Truthiness", and we take a page from Python: anything "empty" is considered false.

```extra
null         -- the null value
false        -- the false value
0            -- the number 0
""           -- empty String
[], Dict(), Set() -- empty array, dict, set
{}           -- empty object, tuple
1/0          -- NaN --> false… I guess? I dunno! What would **you** do with this dumb value!?
```

That leaves everything else as "truthy":

```extra
true  -- the true value
1     -- any number != 0
"any" -- any String that isn't ''
[0], [a: ""], {""}, {foo: ""} Set(0)  -- any non-empty array/dict/object/tuple/et
```

Exception: Views and Class instances (including Regex) are always truthy, and so it is considered a compile-time error to use them as a truthy value.

### Numbers

`1, 2, 0x10, -0b1001, 4e2, 1__000_000` --> Int
`1.0, 2., -0.000_001, 4e-2` --> Float

#### Supported number prefixes for other bases

- `0x` --> hexadecimal (not 0X)
- `0o` --> octal (not 0O)
- `0b` --> binary (not 0B)

TODO: Dozenal.

#### Supported formats

- any number of `_` are ignored
  `1_000` --> 1000
  `1___000` --> 1000
  `0b_1111_0000` --> 240

- Scientific notation "m e ** p" is supported:
  `42e4` --> 42 \* 10 ** 4 = 420,000
  `6.022e23` --> 6.022 \* 10 \*\* 23

If you're thinking "wow these are all supported by JavaScript's `Number()` constructor" then you've figured out what language this is all built in, without noticing the two dozen JS config files in project root.

### Strings

Strings come in a few variants: single-quoted, double-quoted, backticks, and atomic. The quoted variants all support triple-quotes (`'''test'''`). Double-quoted and backticks support tagged strings.

Strings can be spread across multiple lines, though I _recommend_ triple-quotes for that. Triple quotes have the added feature of removing preceding indentation, up to the closing quotes (more below).

Single-quoted do not support String interpolation (`${}`), the `$` character is left intact.

```extra
'testing'      --> testing
'$money'       --> $money
'test1\ntest2' --> test1
                   test2

'test1
test2' --> test1
           test2
```

An even simpler string literal is the "atomic" string, so called because in Ruby and Elixir they are a different 'atom' primitive. They can only have letters, numbers, hyphens, underscores, and emojis.

```extra
:testing     --> "testing"
:real-money  --> "real-money"
:$wat        --> ❌ syntax error
:🤯          --> "🤯"
```

Double-quoted strings: Same as single-quoted, but support _String interpolation_ and can be tagged. Backticks: An alternative to double-quoted (same support for interpolation and tagging).

```extra
"testing"           --> testing
"$money"            --> replaces $money with the stringified contents of `money`

"${money.currency}" --> replaces ${…} with the contents of `money.currency` reference
`${money.currency}` --> same
`$money.currency`   --> replaces $money with `money`, but leaves ".currency"

`\$`   "\$"         --> If you need a dollar sign

"$123"              --> If '$' isn't followed by a reference, there's no need to escape it.
```

String tags work similar to how they do in Javascript - the parts of the string are passed to the 'tag', which better be a function capable of handling all the parts.

Unlike in Js, though, each "part" is passed as its own arg (the string literals are not gathered into one array).

```extra
let
  calculator = fn(# a: Int, # op: String, # b: Int, # out: String) =>
    let
      result =
        if (op is /^\s*\+\s*$/) {
        then:
          a + b
        else:
          a - b
        }
      out = out.replaceAll('?', with: $result)
    in
      `$a$op$b$out`
in
  calculator`$a + $b = ?`
```

Triple quoted strings ignore the first character if it is a newline, and remove the preceding indentation according to the _indentation of the closing quotes_.

If you want to remove the trailing newline, escape it with `\`.

````extra
let
  something-cool: '''
            this is a String,
            right?
            ''' --> "this is a String,\nright?\n"
in …

let
  something-cool: '''
            remove-trailing-newline\
            ''' --> "remove-trailing-newline"
in …

-- this can also be written:
'''test1
test2
''' --> test1
        test2

-- And because of the indent rule, this is also the same String:
'''test1
   test2
   ''' --> test1
          test2

"""
multiline
strings
are
neat
"""

```
use
backticks
if
you
prefer
```
````

All strings use backslash to escape special characters:

```extra
\n --> newline (\x0A)
\t --> tab     (\x09)
\0 --> NUL/␀   (\x00)
\e --> ESC/␛   (\x1b)
\xNN --> 2 digit hex char
\uNNNN --> 4 digit hex char

-- are these characters really relevant? who uses _vertical tab_!?
\r --> silly char   (\x0D)
\v --> vertical tab (\x0B)
\f --> form feed    (\x0C)
\b --> backspace    (\x08)

-- All other backslash+char combinations return the char, even if the character
-- doesn't have any special signifigance.
-- eg
\\ --> \
\' --> '
\` --> `
\) --> )
\$ --> $
```

### Regular Expressions / Regex

```extra
/\b(regular expressions)\b/g  <-- classic perl style regex
/\b(\$\)\b/g
/[abc]/g --> global flag
/[abc]/i --> case-insensitive
/[abc]/m --> multiline match
/[abc]/s --> dot-all match

/\b\d+\D\s/ --> the usual regex features.
```

Extra runs within the JS runtime, and the regular expressions are passed directly to the `RegExp` constructor. The [Mozilla Regex cheat sheet](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet) has lots of good information about what's supported. Say what you will about JS's terrible API (thank you, I will!), the Regular Expressions support is very good.

### Container Types: Array, Dict, Set, and Object

Arrays and Objects are created using the common `[]` and `{}` symbols. Dicts (aka Map in JavaScript) are created using `dict<type>(key: value)` and Sets are created using `set<type>(value)` (`type` is optional in both cases, it is usually inferred).

Keys in Objects and Dicts can be strings, numbers, `null`, `true`, or `false` (i.e. any primitive value).

Objects play double duty as the Tuple type, because they can have positional properties as well as named.

```extra
type User = {
  String -- positional
  age: Int(>=0) -- named
}

a: User = {'Chuck', age: 50}
-- nice and terse, but there is nothing to indicate that User[0] refers to a 'name'
a: Point = {0, 0}  -- on the other handm, it is pretty obvious that this is {x,y}
```

The container types can be split into two families:

<dl>
  <dt>Homogenous</dt><dd>All items must have the same type (array, dict, set)</dd>
  <dt>Heterogenous</dt><dd>All items may have different types (object)</dd>
</dl>

#### Homogenous types: Array, Dict, Set

Homogenous types have only one type, even if that type is an `optional` or `oneOf` type.

Array: a list of homogenous items, indexed by number.
Dict: a lookup/map/hashmap of homogenous items.
Set: an unordered collection of homogenous items. Only one of each item will be included in the set (according to deep equality checks).

Syntax:

- Array: `[] [] [1] [1,] [1, 2, 3]`
- Dict: `Dict() Dict(key: 1) Dict(key: 1,) Dict(1: 1, 'key2': 2, "key$three": 3)`
- Set: `Set() Set(1) Set(1,) Set(1, 2, 3)`

#### Heterogenous types: Tuple, Object

Object: a lookup/map/hashmap of different properties. Each key can have a different type.
Tuple: same as an object, but indexed by number instead of string. Tuples and Objects are just one type that supports *both* string and numeric keys.

Syntax:

- Object: `{} {} {one: 1} {one: 1,} {1: 1, 'two': "two", "$three": [3]}`
- Tuple: `{} {1} {1,} {1,"two",[3]}`

#### More examples

```extra
-- Arrays
[1, 2, 3]        --> [Int] ("Int array") with three entries
[]               --> empty array (Array(Always))
["one", "two", ] --> [String] with two entries (trailing comma is ok)

-- Dicts
Dict(one: 1, two: 2, three: 3) --> Dict(Int) with three entries
Dict()                         --> empty dict (Dict(Always))
Dict(number1: "one", number-two: "two", ) --> Dict(String) with two entries
❌ {}  --> empty object, not a dict!

-- Sets
Set(1, 2)     --> Set(Int) (Set of Ints)
Set()         --> empty set

-- Objects
{ age: 1, name: 'foo' } --> {age: Int, name: String}
{}                      --> empty object or tuple

-- Tuples are just objects with numeric keys
{1, "two", [3,4,5]} --> {Int, String, [Int]} (3-tuple of Int, String, Int array)
{}                 --> empty object or tuple

-- There is no actual Tuple type, objects support number keys, and they can be
-- mixed and matched.
{0, 1, last: 10}  -- {Int, Int, last: Int}
```

Objects and Tuples can contain values with different types (this is called a **Product Type**). What happens if you put different types into an array or dict?

```extra
[1, 2, "3"] -- Invalid!? Nope! This has the type `Array(Int | String)`
-- (**ahem**, actually it has the type `Array(1 | 2 | "3")`)
```

Enter the **OneOf** type.

### OneOf

OneOf types represent a value that could be one type or another (or three or four types).

The most common is called the _optional_ type, which is any type `T` or the `null` value. But you may also need to store a value that is _either_ of type `Int` _or_ a `String` (input that is either "raw" (`String`) or already processed into an `Int`, for example).

OneOf types can be expressed in general as `type1 | type2 | ...`, e.g. `Int | String` or `[String] | null`. The optional type has a shorthand `Int? --> Int | null`.

```extra
[ 1, 2, null]  --> [Int | null] aka [Int?]
[ 1, 2, "age"]  --> [Int | String]
```

The only problem with _oneOf_ types is that you cannot call methods or properties on them, unless the method is shared between both types. You can get around this limitation using _type guards_ (or other type assertions).

### Literal types

So far we've been expressing numbers and strings using their types, but _literal_ types are also supported. For instance, the expression:

```extra
1 + 2
```

Is parsed as `literal(1) + literal(2)`, and resolved to the type `literal(3)`. You can express enumerations this way, too:

```extra
size: 'small' | 'medium' | 'large' --> size must be one of these strings, no others.
```

### Type definitions

We've seen many definitions already.

- `null` `true` `false` some literal value types
- `1` `1_000` `'text'` also literal types
- `Boolean` `Int` `Float` `String` the basic types
- `Boolean | Int` one of types
- `Array(Int)` `Array(Int | String)` `Array(Float?)` arrays
- `Dict(Int)` `Dict(Int | String)` `Dict(Float?)` dicts
- `{Int, String}` `{Int?, String?}` tuples
- `{foo: Int, bar: String}` `{foo: Int?, bar: String?}` objects
- `Array(Boolean) | Array(Int | String)` one of types mixed with container types

## Functions

Extra's functions are bonkers. They support _positional_ and _named_ arguments, along with all sorts of variadic arguments, and

Positional arguments have a `#` prefix, `# like: This`. Named arguments `do: Not`. Named arguments can be aliased `like so: GotIt?`. Variadic arguments `...# are: LikeThis` or `...like: This`. Keyword args are `**like: This`.

Examples:

```extra
fn doEeet(# count: Int, # name: String = '', age: Int = 0, reason why: String) => …fn body…
-- #count is required
-- #name is optional (default value provided)
-- age is optional, and is a named argument
-- reason is required. doEeet() must be called with the reason: argument,
-- but the fn body uses the name "why"

doEeet(1, reason: '')                   -- name = '', age = 0
doEeet(1, 'foo', reason: '')            -- name = 'foo', age = 0
doEeet(1, 'foo', reason: '', age: 42)   -- name = 'foo', age = 42

❌ doEeet(reason: '')                    -- count is required
❌ doEeet(1)                             -- reason is required
```

If the argument type is null-able, you can make the argument optional `like?: This` (`like: This | null`). If the argument is _generic_, it will be made optional only if the type is null-able. In other words:

```extra
fn first-or<T>(# array: Array(T), else fallback?: T) =>
  if (array) {
  then:
    array[0]
  else:
    fallback
  }

let
  a: Array(Int) = […]
  b: Array(Int?) = […]
in
  first-or(a, else: 1) --> else is required because type `Int` is not nullable
  first-or(b, else: 1) --> still fine here, but...
  first-or(b)          --> else is optional (defaults to `null`) because `Int?` aka `Int | null` is nullable
```

Confusing! Sorry, it is, but I also think it is useful.

### Inferred types

The return type can always be inferred. Argument types are required when you are defining a function, but if you are calling a function that expects a function, like `map`, `reduce`, `sort`, you can omit the argument types. The trick here is that the receiving function will define the types, so in this case you don't have to.

```extra
[1, 2, 3].map(fn(num) => num + 1) --> [2, 3, 4]
```

In the example above, `num` is a named argument, but `map` expects a function that accepts two positional arguments `# value: T, index: Int`. Since the first named argument is compatible with `# value: Int`, the compiler figures out what to do.

### Variadic Arguments

There are _three_ brands of variadic arguments.

- variadic positional arguments - must be an `Array` type, and there can only be one.
- keyword argument list - must be a `Dict` type, and there can only be one
- repeated named arguments - must be an `Array` type, and there can be multiple

#### Variadic Positional Arguments

These combine well with refined Array types, for instance, we can implement `add` as a variadic function, but require a minimum number of arguments.

```extra
fn add(...# numbers: Array(Int, >=2)) =>
  numbers.reduce(0, fn(memo, num) => memo + num)

add(1, 10) --> 11
add(1, 10, 31) --> 42
❌ add() -- not enough arguments
❌ add(1) -- not enough arguments

let
  numbers = [1, 10, 31]
in
  add(...numbers)
```

#### Keyword Argument List

Any named argument that are not otherwise declared can be put into a "keyword arguments list", `**remaining: Dict(String, T)`.

```extra
fn list-people(greeting: String = 'Hi,', **people: Dict(String)) =>
  people.map((name, value) =>
    `$greeting $name: $value`).join(' - ')


list-people(greeting: 'Hello,', Jane: 'Doctor', Emily: 'Miss')
--> "Hello, Doctor Jane - Hello, Miss Emily"


let
  people = Dict(Jane: 'Doctor', Emily: 'Miss')
in
  list-people(**people)
  --> "Hello, Doctor Jane - Hello, Miss Emily"
```

#### Repeated Named Arguments

You can specify the same argument by name, multiple times.

```extra
fn returnIf<T>(# condition: Boolean, ...and: Array(Boolean), then: T): T?

returnIf(a == 1, and: b == 1, and: c == 2, then: 'yay!') --> 'yay!' | null
```

#### Proposal: Function overrides

*Warning*: I haven't implemented this - and it requires that the *runtime* include *type information* (otherwise it can't disambiguate the arguments), which I don't like... so I'm considering this

You can define separate function implementations if you want to have lots of different signatures all wrapped up in one function name. The Extra compiler will verify that the implementations are unambiguous.

```extra
fn add {
  fn(# a: Int, # b: Int) => a + b
  fn(# a: String, # b: String) => a <> b
  -- if the types are ambiguous, the compiler will complain
  -- this function cannot be disambiguated w/ the previous one
  ❌ fn(# a: String, # b?: String) => a <> (b ?? a)
  -- easily resolved, and you can even invoke a previous implementation:
  fn(# a: String) => add(a, a)
}

add(1, 2) --> 3
add('a', 'b') --> ab
add('a') --> aa
add([1]) --> ❌
```

## `if`

Usually you will invoke `if` with the "block" syntax, `if (condition) { then: value }`. The `else` branch is optional. If it's not provided, it defaults to `null`. `if (condition) { then: value, else: null }`.

As in all functional programming languages, `if` is an expression that returns the value of the branch that was executed. If the `else` branch is not given, `null` is returned.

```extra
if (test1 or test2) {
then:
  result_1
} --> result_1 | null

if (test1 or test2) {
then:
  result_1
else:
  result_2
} --> result_1 | result_2
```

Multiple `elseif` branches can be provided:

```extra
if (test1 or test2) {
then:
  result_1
elseif (test2):
  result_2
else:
  result_3
} --> result_1 | result_2 | result_3
```

There is also an "inline" version, which might show how `if` follows the same function argument rules as Extra in general. Assume `elseif()` is a function that also accepts a condition.

```extra
if (test1 or test2, then: result-1, elseif (test2, result_2), else: result-4)
```

`if` is, of course, implemented internally by the compiler. It had to be in order to implement the type narrowing features. But I made sure that the syntax was not "special". Given the right syntax and primitives, it could be expressed as an Extra function.

```extra
if (test1 or test2) {
then:  -- a required named argument
  result_1
elseif (test2): -- this looks like special syntax, but actually it's just function invocation:
  result_2      -- `elseif (# condition): # then` (the elseif clauses are variadic in the 'if' function)
else:  -- optional named argument
  result_3
}
```

For the curious, the function signature of `if` would be *something like*:

```extra
fn if<T>(
  # condition: Boolean
  then: lazy T
  ...# elseif: Array(lazy T)
  else?: lazy T
): T

fn elseif<T>(# condition: lazy Boolean, # then: lazy T)
```

In the future I'd like to try to support an `implication` type, but I'm not sure I'll ever be able to support the variadic `elseif` array, such that each subsequent invocation implies all the previous ones are false. The `implication` type, in a simple `if/else` version, would look something like this:

```extra
fn if<T, C is Implication>(
  # condition: C
  then: Implies(C, T)
  else?: Implies(not C, T)): T
=> …
```

## `guard`

Guard expressions are useful in any language, but the `guard` syntax in Swift was one of my favourite language features, and so I'm unapologetically stealing it. Of course w/ Extra flair.

All of the

```extra
fn(# name: String?, hobbies: Array(String)): String =>
  guard(
    name != null
  else:
    ''
  ):
    guard(
      hobbies.length > 0
    else:
      name <> ' is not very interesting'
    ):
      name <> ': ' <> hobbies.join(', ')
```

Like `if`, you could imagine that this was implemented after the fact as an Extra function. The signature would be:

```extra
fn guard<T>(
  # condition: Boolean
else: lazy T
  # do: lazy T
): T
```

## Operators

### Basic Math

```extra
1 + 2    --> 3    Addition
15 - 2   --> 13   Subtraction
8 * 2    --> 16   Multiplication
10 / 5   --> 2    Division
10 / 6   --> 1.6… Division returns a Float *even if* you provide two Ints, see // below
2 ** 8   --> 256  Power/exponent
```

### CompSci Math

```extra
-- Integer/floor division removes the floating point "remainder" by flooring the
-- result. When dividing negative numbers, it always rounds down (not towards
-- zero).
15 // 2  --> 7
-10 // 3 --> -4

10 % 3 --> 1  Modulo / Remainder, also works with floats

-- Binary Operators
0b100 | 0b001  --> 0b101 (5)
0b110 & 0b010  --> 0b010 (2)
0b110 ^ 0b010  --> 0b100 (4)
~0b11010110    --> -215
-- negate with a bitmask:
~0b11010111 & 0b11111111 --> 0b00101000 (40)
```

### Comparison

```extra
a > b
a >= b
a < b
a <= b
a == b  --> does a deep comparison of objects/arrays/dicts/etc
a != b

a <=> b --> the sort operator compares two strings or two numbers, and returns -1, 0, or 1
```

### Logical Operators

Logical operators "short circuit", e.g. they return values without converting them to a Boolean.

```extra
a or b  --> Logical Or, returns `a` if a is true, otherwise returns b
a and b  --> Logical And, returns `b` if a is true, otherwise returns a

-- Examples
a = 5
b = 0
c = 1

a and c --> 1 (returns c, because a was true)
a or c --> 5 (returns a, because a was true)

b and a --> 0 (returns b, because b was false)
b or a --> 5 (returns a, because b was false)

```

Btw, if you think of `and` as "multiplication" (if either is 0/false, result is
0/false) and `or` as "addition" (if either is 1/true, result is 1/true) you'll
have an easier time remembering the order of operations (`and` first, then `or`)

### Regex Match Operator

Funny story... when I implemented the `matches` operator, I realized that `x matches Foo` (where `Foo` is a class or other type) could only reasonably mean that `x is Foo`. Well wait a second, if `is` can be used there, could I also use it in other match contexts? Yes! I had already moved regex matches into the same bucket as generic

```extra
"test String" is /[test]/ --> Boolean
```

### Null Coalescing Operator

Included only because of its cool name. 😎

```extra
a ?? b --> returns `b` if a is null, otherwise returns `a`
```

### Other Null Safe Operators

```extra
user.address?.street  -- null-safe property access
items?.[0]  -- null safe array access
user.format?.(address)  -- null safe function invocation
```

### String Concatenation

I've never liked `+` as String/Array concatenation. `+` should be communative, because maths.

```extra
"aaa" <> "BBB" --> "aaaBBB"

$12345 <> 'dollars'  --> "12345 dollars"
`${12345} dollars`  --> "12345 dollars"
```

### Array Concatenation

Sure I could've implemented the `<>` operator in a way that supported Strings
_and Arrays_, why not have two operators so that the *intention* was that much
clearer? So that's what I did. `++` for Arrays.

```extra
[1,2,3] ++ [4,5,6]
```

### Object and Dict Merging

Last but not least, you can merge two objects or dicts with `~~`, and in this
case the values on the left-hand-side will be replaced with the values on the
right-hand-side if they have the same keys.

**Dict Example**
```extra
let
  old_users = Dict(a: …, b: …)
  new_users = Dict(b: …, c: …)
in
  old_users ~~ new_users
  -- returns Dict(a: …, b: …, c: …), with 'b' coming from new_users
```

**Object Example**
```extra
let
  user = {name: 'Alice', age: 50}
  updates = {age: 51}
in
  user ~~ updates
```

Since Objects are _also Tuples_ I had to make a decision on how to merge
positional arguments. Should they override in numeric order (spoiler: yes they
do) or should they _concatenate_ (they don't)...

```extra
let
  weather = {50, unit: 'celsius'}
  new_temp = 60
in
  weather ~~ {new_temp}
  -- option A: {60, unit: 'celsius'}
  -- option B: {50, unit: 'celsius', 60}
```

I went with option A. I'm relieved to hear that you agree with this decision.

### Splat operator `...`

All of the container types (Array, Tuple, Object, Dict, and Set) support the `...` unary operator to merge multiple arrays/tuples/dicts/sets into one. Some containers can be mixed and matched, others can't. Try 'em and find out!

```extra
-- arrays
let
  a: [1, 2, 3]
  b: [4, 5, 6]
in
  [...a, ...b] --> [1, 2, 3, 4, 5, 6]
  -- a ++ b --> same

-- dicts
let
  a: Dict(a: 1, b: 2, c: 3)
  b: Dict(d: 4, e: 5, f: 6)
in
  Dict(...a, ...b) --> Dict(a: 1, b: "2", c: 3, d: 4, e: "5", f: 6)
  -- a ~~ b --> same

-- sets
let
  a: Set(1, 2, 3)
  b: Set(3, 4, 5)
in
  Set(...a, ...b) --> Set(1, 2, 3, 4, 5)
  -- a ++ b --> same
```

The `...` operator will also merge keys, preferring the later values, which provides yet another way to merge Dicts and Objects.

```extra
-- objects
let
  a: {a: 1, b: "2", c: 3}
  b: {c: 4, d: "5", e: 6}
in
  {...a, ...b} --> {a: 1, b: "2", c: 4, d: "5", e: 6}
  -- a ~~ b --> same

-- tuples
let
  a: {0, 0, spin: 'up', name: 'electron'}
  b: {1, 1, spin: 'down', quarks: 3}
in
  {...a, ...b} --> {1, 1, spin: 'down', name: 'electron', quarks: 3}
  -- a ~~ b --> same
```

If you really had your heart set on concatenating two tuples... I don't have an easy shorthand for this. I didn't want `...` and `~~` to behave differently, and I didn't want to override the `<>` or `++` operators. The one thing that's very easy is to just _insert_ the values into the new tuple explicitly.

```extra
let
  weather = {50, unit: 'celsius'}
  new_temp = 60
in
  {...weather, new_temp}
  -- {50, unit: 'celsius', 60}
let
  user = {name: 'Alice', age: 50}
  updates = {age: 51}
in
  {...user, ...updates}
```

### Putting it all together

I want to take a moment to point something out - there are always two ways to
merge/join/concat. You can start with the "container" and put in the parts you
want, or you can start with one container and join others onto it. I'll show you
what I mean:

#### String

1. String interpolation: `"${name} is $age years old"`
2. String concatenation: `name <> ' is ' <> $age <> ' years old'`

#### Array

1. Splat: `[...list1, ...list2]`
2. Concatenation: `list1 ++ list2`

#### Dict

1. Splat: `Dict(...dict1, ...dict2)`
2. Merge: `dict1 ~~ dict2`
(`dict2` overrides keys in `dict1` in both cases)

#### Set

1. Splat: `Set(...set1, ...set2)`
2. Union: `set1 + set2`

#### Tuple/Object

1. Splat: `{...obj1, ...obj2}`
2. Merge: `obj1 ~~ obj2`

I think this is a nice symmetry, and also the operators indicate (somewhat) the type that is being operated on.

### Array/Dict/Tuple/Object Access / Property Access

Property access looks like you'd expect `object.property`, and works on objects and dicts. `[]` works on all container types (object, dict, tuple, array), and accepts expressions (e.g. `object["foo"] --> object.foo` or `array[1 + 1] --> array[2]`). Tuples should use property access `tuple.0` but you _can_ use an array index if you're careful.

```extra
-- tuple: {Int, String, name: String}
tuple[0] == tuple.0 -- indexing with an int literal is fine
--> Int

-- x: Int
tuple[x] --> ❌

-- x: 0 | 1
tuple[x] --> oneOf(tuple.0, tuple.1) --> Int | String
```

An important difference with property access and array access is that property access will prefer built-in properties, whereas array access will always search for the value in the table. For example, Dict defines `map` and `mapEntries` methods, and so `dict.map` will call that function. But `dict["map"]` will ignore the built-in function and instead search for an entry named `map` and return that. It will never return the built-in 'map' function.

Yes I tried to make Extra familiar to JavaScript devs, but no I'm not going to copy parts that would clutter the language with ambiguities.

If the property access isn't a build-in, it will search for that property in the Dict/Object. So `things.foo == things['foo']`. These will return `T | null` unless the key is known to be in the dict/object:

```extra
let
  ages: Dict(Int) = [alice: 50, bob: 46]
in
  ages['alice']  --> returns 50
  ages.bob       --> returns 46
  ages.map       --> `map` function, which iterates over the values
  ages['map']    --> returns null

-- there is also a "null safe" property access operator
-- ie if `person` could be null:
person?.address.street ?? 'default address'
--> returns person.address.street if person is defined, otherwise returns 'default address' due to null coalescing operator
```

### Pipe Operator

Everyone's favourite! Well it's _my_ favourite, and if you haven't used it today's your day. It's more likely that you've used chained methods – the pipe operator is a natural companion, but in cases where a chained method isn't an option. Here's an example that surrounds a stringified array with `"[]"` characters, _and_ adds a trailing comma if the array wasn't empty.

```extra
[1,2,3].filter(fn(i) => i < 3).join(',')
  |>
    if (#.length) {
    then:
      $# <> ','
    else
      ''
    }
  |>
    `[$#]`  --> `"[1,2,3,]"`
```

There's also a null-safe version:

```extra
-- name is String | null
name ?|> name <> ':' --> inside the pipe `name` is guaranteed to be a String, otherwise the expression is skipped and `null` is returned.
```

There's a clever trick with the `=>` operator that allows us to "name" the `#` symbol. This is eerily similar to `fn() =>`, so be mindful that we are using the *match* feature of Extra here, not function invocation.

```extra
[1,2,3].filter(fn(i) => i < 3).join(',')
  |> numbers =>
    if (numbers.length) {
    then:
      $numbers <> ','
    else:
      ''
    }
  |> numbers => `[$numbers]`  --> `"[1,2,3,]"`
```

[^1]: JSX

What!? Should I call it something else just because it _is_ something else? Bah. It walks like a duck and quacks like a duck, so I'm calling it JSX.

Similarities:

- Within a text node, `{…}` encloses an expression that is inserted as a child.

  ```extra
  <Foo>Name: {@user.name}</Foo>
  <Foo>Item 1: {if (foo) { then: <Item1 />, else: <Item 2/>}}</Foo>
  ```

The differences from React JSX:

- attributes can receive extra values, so `<Foo prop=bar />` assigns the variable `bar` to `prop`
  There are limitations to this, though: you cannot use most binary operators, only 'access' operators like `.` and `[]`. You can always enclose operations in `()`.

  `<Foo prop=1 + 1 />` is invalid.
  `<Foo prop=(1 + 1) />` is fine.

  `{}` is, like everywhere else in Extra, for creating objects.

  ```extra
  <Foo prop={a: 1, b: "two"} />
  ```

- shorthand for boolean `isSomething` has corresponding `!isSomething` shorthand.

```extra
-- In React-JSX, boolean properties are either "bare" (`isNifty` in this example), or given the values `true|false`.
<Test isNifty isGreat={true} isTerrible={false} />

-- In Extra-JSX you can use `isNifty` like in JSX, or negate a property using `!isTerrible`
-- and, since expressions are supported, you don't enclose `true|false` in curly braces.
<Test isNifty isGreat=true !isTerrible />
```
