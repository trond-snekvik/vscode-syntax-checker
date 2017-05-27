# Async Syntax Checker

The Async Syntax Checker lets you run any syntax checker or linter that follows GCC's error format on the active file.

## Features

The syntax checker runs in the background, calling a compiler, linter or syntax checker on your code as you type it.

You may run any number of syntax checkers or linters in parallel.

## Requirements

The default configuration assumes that the user has a version of GCC in their path, but this can be overridden through the configuration.

## Extension Settings

This extension contributes the following settings:

* `syntax-checker.checkers`: A list of checkers to run.
* `syntax-checker.delay`: Time in milliseconds to wait after a text change before triggering the syntax checker.

## Adding checkers

You may add any number of syntax checkers to any combination of languages.

To add a syntax checker, open your settings.json (File->Preferences->Settings), and look for the option `"syntax-checker.checkers"`. It requires an array of checker configurations, where each configuration requires the following parameters:

* `name`: Name of the checker, shows up on each problem in the editor.
* `cmd`: External command to run, e.g. `/usr/bin/gcc`.
* `arguments`: Array of command line arguments to pass to the command, e.g. a list of include directories or compiler flags.
* `languageIds`: Array of language IDs, as interpreted by VS Code, e.g. `["c", "cpp"]`.

### Caveats

The Async Syntax Checker assumes that the diagnostic format follows the GCC diagnostic format of 

`<file>:<line>:<column>: <severity>: <message>`

Where severity is one of "error", "warning" and "fatal error". Any other diagnostics will be ignored.

The Async Syntax Checker sends the contents of the open file to the command through a pipe. To prevent compilers like GCC and Clang from returning early, it'll add `-` (minus) to the end of the list of arguments, which makes GCC wait for input to finish before running. Note that GCC and Clang needs a `-x <language>` flag to know how to interpret the piped input.

## Release Notes

### 1.0.0

Initial release of Async Syntax Checker.
