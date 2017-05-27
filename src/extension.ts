'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as subprocess from 'child_process';
import * as mutex from 'async-mutex';
import * as path from 'path';

function toDiagSeverity(string: string): vscode.DiagnosticSeverity {
    switch (string.toLowerCase()) {
        case 'error':
        case 'fatal error':
            return vscode.DiagnosticSeverity.Error;
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}

class SyntaxCheckerConfig {cmd: string; name: string; arguments: string[]; languageIds: string[]}


class SyntaxChecker {
    diags: vscode.DiagnosticCollection;
    mut: mutex.Mutex;
    token: number;
    timer: NodeJS.Timer;
    delay: number;
    config: SyntaxCheckerConfig;
    disposables: vscode.Disposable[];

    constructor(config: SyntaxCheckerConfig, delay: number, context: vscode.ExtensionContext) {
        this.disposables = [];
        this.mut = new mutex.Mutex();
        this.token = 0;
        this.delay = delay;
        this.config = config;
        this.diags = vscode.languages.createDiagnosticCollection(this.config.name);
        this.disposables.push(vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            this.trigger(event.document);
        }));
        vscode.workspace.onDidOpenTextDocument(this.trigger, this);
        this.disposables.forEach((disposable) => { context.subscriptions.push(disposable) });
        if (vscode.window.activeTextEditor)
            this.trigger(vscode.window.activeTextEditor.document)
    }

    dispose() {
        // Invalidate the current token to prevent pushing of new diags while running dispose:
        this.disposables.forEach((disposable: vscode.Disposable) => { disposable.dispose(); });
        this.mut.runExclusive(() => {
            this.token++; 
            this.diags.dispose();
        });
    }

    trigger(doc: vscode.TextDocument) {
        if (this.config.languageIds.indexOf(doc.languageId) != -1) {
            if (this.timer) { clearTimeout(this.timer); }
            this.timer = setTimeout(() => {
                this.mut.runExclusive(() => { 
                    var token = ++this.token;
                    try {
                        this.run(doc, token);
                    } catch (e) {
                        console.log(e);
                    }
                });
            }, this.delay);
        }
    }

    run(doc: vscode.TextDocument, token: number) {
        this.diags.clear();
        let diags = {};

        let text = doc.getText();
        let options = {cwd: vscode.workspace.rootPath};
        let proc: subprocess.ChildProcess = subprocess.spawn(this.config.cmd, this.config.arguments, options);
        proc.stdout.on('data', (data: string) => {
            this.handleOutput(data, diags);
        });
        proc.stderr.on('data', (data: string) => {
            this.handleOutput(data, diags);
        });
        proc.on('close', (code, signal) => {
            this.collectDiags(doc, diags, token);
        });
        proc.on('error', (err: Error) => {
            vscode.window.showWarningMessage("Syntax checker " + this.config.name + " received error: " + err);
        });
        proc.stdin.write(text);
        proc.stdin.end();
    }

    handleOutput(stdout: string, diags) {
        let re: RegExp = new RegExp(/^(..[^:\r\n~$%^]+):(\d+):(\d+): (error|warning): (.*)$/, 'gmi');
        var arr: RegExpExecArray;
        while (arr = re.exec(stdout)) {
            var range = new vscode.Range(Math.max(+arr[2]-1, 0), Math.max(+arr[3]-1, 0), Math.max(+arr[2]-1, 0), +arr[3]);
            var severity = toDiagSeverity(arr[4]);
            var match = new vscode.Diagnostic(range, arr[5], severity);
            match.source = this.config.name;
            if (!(arr[1] in diags)) 
                diags[arr[1]] = [];
            diags[arr[1]].push(match);
        }
    }

    collectDiags(doc: vscode.TextDocument, diags, token: number) {
        this.mut.runExclusive(() => {
            if (token == this.token) {
                for (var file in diags) {
                    var uri: vscode.Uri;
                    var isCurrFile = (file.match(/^<.*>$/));
                    if (isCurrFile)
                        uri = doc.uri;
                    else {
                        if (path.isAbsolute(file))
                            uri = vscode.Uri.file(file);
                        else
                            uri = vscode.Uri.file(vscode.workspace.rootPath + '/' + file);
                    }
                    
                    // If possible, find the word at each match position, to get highlight on entire word:
                    vscode.workspace.openTextDocument(uri).then((textDoc: vscode.TextDocument) => {
                        if (textDoc && (isCurrFile || !textDoc.isDirty)) {
                            diags[file].forEach((match: vscode.Diagnostic) => {
                                let newRange = textDoc.getWordRangeAtPosition(new vscode.Position(match.range.start.line, match.range.start.character));
                                if (newRange) {
                                    match.range = newRange;
                                }
                            });
                        }
                        this.diags.set(uri, diags[file]);
                    }, () => { this.diags.set(uri, diags[file]); });
                }
            }
        });
    }
}

var gCheckers: SyntaxChecker[];

function setup(context: vscode.ExtensionContext) {
    let config = vscode.workspace.getConfiguration('syntax-checker');
    let delay = config.get('delay') as number;
    let checkers = config.get('checkers') as SyntaxCheckerConfig[];
    gCheckers = checkers.map((checkerConfig) => {
        checkerConfig.languageIds = checkerConfig.languageIds.map(lang => { return lang.toLowerCase();})
        checkerConfig.arguments.push('-')
        return new SyntaxChecker(checkerConfig, delay, context);
    });
}

export function activate(context: vscode.ExtensionContext) {

    vscode.workspace.onDidChangeConfiguration(() => {
        deactivate();
        setup(context);
    })
    setup(context);
}

export function deactivate() {
    gCheckers.forEach(checker => {checker.dispose();})
}