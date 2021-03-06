'use strict';

/*
 * Copyright (c) 2020 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the
 * Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
 * version 2 with the GNU Classpath Exception, which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import { WorkspaceFolder, OutputChannel } from "vscode";
import { Build } from './Build';
import { ChildProcess } from 'child_process';
import { JavaUtils } from '../server/tooling/utils/JavaUtils';

export class Gradle implements Build {

    constructor(
        public workspaceFolder: WorkspaceFolder) {
    }

    public static detect(workspaceFolder: WorkspaceFolder): boolean {
        let build = path.join(workspaceFolder.uri.fsPath, 'build.gradle');
        return fs.existsSync(build);
    }

    public buildProject(callback: (artifact: string) => any): void {
        let gradleHome: string | undefined = this.getDefaultHome();
        if (!gradleHome) {
            throw new Error("Gradle home path not found.");
        }
        let gradleExe: string = this.getExecutableFullPath(gradleHome);
        // Gradle executable should exist.
        if (!fse.pathExistsSync(gradleExe)) {
            throw new Error("Gradle executable [" + gradleExe + "] not found");
        }
        let gradle = path.join(this.workspaceFolder.uri.fsPath, 'build.gradle');
        let process: ChildProcess = cp.spawn(gradleExe, ["clean", "build"], { cwd: this.workspaceFolder.uri.fsPath });

        if (process.pid) {
            let outputChannel = vscode.window.createOutputChannel(path.basename(this.workspaceFolder.uri.fsPath));
            outputChannel.show(false);
            let logCallback = (data: string | Buffer): void => outputChannel.append(data.toString());
            if (process.stdout !== null) {
                process.stdout.on('data', logCallback);
            }
            if (process.stderr !== null) {
                process.stderr.on('data', logCallback);
            }
            process.on('error', (err: Error) => {
                console.log('error: ' + err.message);
            });
            process.on('exit', (code: number) => {
                if (code === 0 && this.workspaceFolder) {
                    let targetDir = path.join(this.workspaceFolder.uri.fsPath, 'build', 'libs');
                    if (!fs.existsSync(targetDir)) {
                        console.log("no build dir found ", targetDir);
                        return;
                    }
                    let artifacts = fs.readdirSync(targetDir);
                    let artifact: string | null = null;
                    for (var i = 0; i < artifacts.length; i++) {
                        var filename = path.join(targetDir, artifacts[i]);
                        if (artifacts[i].endsWith('.war')
                            || artifacts[i].endsWith('.jar')) {
                            artifact = filename;
                            break;
                        }
                    }
                    if (artifact !== null) {
                        callback(artifact);
                    } else {
                        vscode.window.showErrorMessage(artifact + ' not found.');
                    }
                }
            });
        }
    }

    public getDefaultHome(): string | undefined {
        const config = vscode.workspace.getConfiguration();
        let gradleHome: string | undefined = config.get<string>('gradle.home');
        if (!gradleHome) {
            gradleHome = process.env.GRADLE_HOME;
        }
        return gradleHome;
    }

    public getExecutableFullPath(gradleHome: string): string {
        let homeEndsWithPathSep: boolean = gradleHome.charAt(gradleHome.length - 1) === path.sep;
        // Build string.
        let gradleExecStr: string = gradleHome;
        if (!homeEndsWithPathSep) {
            gradleExecStr += path.sep;
        }
        gradleExecStr += 'bin' + path.sep + 'gradle';
        if (JavaUtils.IS_WIN) {
            if (fs.existsSync(gradleExecStr + '.bat')) {
                gradleExecStr += ".bat";
            } else if (fs.existsSync(gradleExecStr + '.cmd')) {
                gradleExecStr += ".cmd";
            }
        }
        return gradleExecStr;
    }

}