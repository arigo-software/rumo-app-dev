// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FileSystemWatcher } from './fileSystemWatcher';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "rumo-app-dev" is now active!');

	const fileSystemWatcher = new FileSystemWatcher();
	context.subscriptions.push(fileSystemWatcher);

	const uploadAllFilesCommand = vscode.commands.registerCommand('rumo-app-dev.uploadAllFiles', async () => {
		try {
			await fileSystemWatcher.uploadAllFiles();
		} catch (err) {
			vscode.window.showErrorMessage(`Error uploading all files: ${(err as Error).message}`);
		}
	});

	context.subscriptions.push(uploadAllFilesCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
