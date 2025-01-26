import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SftpSync } from './sftpSync';

const BUILD_TYPE_DIR = 'build/type';

export class FileSystemWatcher {
	private configWatcher: vscode.FileSystemWatcher | undefined;
	private sftpSync: SftpSync;
    private watcher: fs.FSWatcher | undefined;
	private changeTimeouts: Map<string, NodeJS.Timeout> = new Map();

	constructor() {
		this.sftpSync = new SftpSync();
		this.initialize();
	}

	private async initialize() {
		this.watchConfigFile();
		try {
			await this.sftpSync.connect();
			if (this.sftpSync.isConnected()) {
				this.createWatcher();
			}
		} catch (err) {
			vscode.window.showErrorMessage('Initial SFTP connection failed. Will retry on configuration change.');
		}
	}

	private createWatcher() {
		const buildTypeDir = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, BUILD_TYPE_DIR);

		// Create the build/type directory if it doesn't exist
		if (!fs.existsSync(buildTypeDir)) {
			fs.mkdirSync(buildTypeDir, { recursive: true });
		}

		this.createWatcherForDirectory(buildTypeDir);
	}

	private createWatcherForDirectory(dirPath: string) {
		const watchOptions = { recursive: true };
		fs.watch(dirPath, watchOptions, (eventType, filename) => {
			if (filename) {
				const filePath = path.join(dirPath, filename);
				if (fs.statSync(filePath).isDirectory()) {
					this.onDirectoryCreate(filePath);
				} else if (filename.endsWith('.js') || filename.endsWith('.js.map')) {
					if (eventType === 'change') {
						this.onFileChange(vscode.Uri.file(filePath));
					} else if (eventType === 'rename') {
						if (fs.existsSync(filePath)) {
							this.onFileCreate(vscode.Uri.file(filePath));
						} else {
							this.onFileDelete(vscode.Uri.file(filePath));
						}
					}
				}
			}
		});
	}

	private onDirectoryCreate(dirPath: string) {
		vscode.window.showInformationMessage(`Directory created: ${dirPath}`);
		this.createWatcherForDirectory(dirPath);
	}

	private watchConfigFile() {
		const configPath = new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], '.vscode/sftp.json');
		this.configWatcher = vscode.workspace.createFileSystemWatcher(configPath);

		this.configWatcher.onDidChange(this.onConfigChange.bind(this));
		this.configWatcher.onDidCreate(this.onConfigChange.bind(this));
		this.configWatcher.onDidDelete(this.onConfigChange.bind(this));

		vscode.workspace.onDidSaveTextDocument((document) => {
			if (document.uri.fsPath.endsWith('sftp.json')) {
				this.onConfigChange();
			}
		});
	}

	private onConfigChange() {
		vscode.window.showInformationMessage('SFTP configuration changed, reloading...');
		this.sftpSync.loadConfig();
		this.sftpSync.connect().then(() => {
			if (this.sftpSync.isConnected()) {
				this.recreateWatcher();
			}
		}).catch(() => {
			vscode.window.showErrorMessage('SFTP connection failed after configuration change.');
		});
	}

	private async onFileChange(uri: vscode.Uri) {
		vscode.window.showInformationMessage(`File changed: ${uri.fsPath}`);
		console.log(`Uploading changed file: ${uri.fsPath}`);

		if (this.changeTimeouts.has(uri.fsPath)) {
			clearTimeout(this.changeTimeouts.get(uri.fsPath)!);
		}

		this.changeTimeouts.set(uri.fsPath, setTimeout(async () => {
			try {
				await this.sftpSync.uploadFile(uri.fsPath);
			} catch (err) {
				console.error(err)
				if (!this.sftpSync.isConnected()) {
					await this.sftpSync.reconnect();
					await this.sftpSync.uploadFile(uri.fsPath);
				} else {
					vscode.window.showErrorMessage(`Failed to upload file: ${uri.fsPath}`);
				}
			}
			this.changeTimeouts.delete(uri.fsPath);
		}, 1000));
	}

	private async onFileCreate(uri: vscode.Uri) {
		vscode.window.showInformationMessage(`File created: ${uri.fsPath}`);
		console.log(`Uploading created file: ${uri.fsPath}`);
		try {
			await this.sftpSync.uploadFile(uri.fsPath);
		} catch (err) {
			if (!this.sftpSync.isConnected()) {
				await this.sftpSync.reconnect();
				await this.sftpSync.uploadFile(uri.fsPath);
			} else {
				vscode.window.showErrorMessage(`Failed to upload file: ${uri.fsPath}`);
			}
		}
		this.recreateWatcher();
	}

	private async onFileDelete(uri: vscode.Uri) {
		vscode.window.showInformationMessage(`File deleted: ${uri.fsPath}`);
		console.log(`Deleting file: ${uri.fsPath}`);
		try {
			await this.sftpSync.deleteFile(uri.fsPath);
		} catch (err) {
			if (!this.sftpSync.isConnected()) {
				await this.sftpSync.reconnect();
				await this.sftpSync.deleteFile(uri.fsPath);
			} else {
				vscode.window.showErrorMessage(`Failed to delete file: ${uri.fsPath}`);
			}
		}
	}

	public async uploadAllFiles() {
		try {
			if (!this.sftpSync || !this.sftpSync.isConnected()) {
				vscode.window.showErrorMessage('SFTP connection not established');
				return;
			}
			await this.sftpSync.uploadAllFiles();
		} catch (err) {
			vscode.window.showErrorMessage(`Error uploading all files: ${(err as Error).message}`);
		}
	}

	private recreateWatcher() {
		this.watcher?.close();
		this.createWatcher();
	}

	public dispose() {
		this.watcher?.close();
		this.configWatcher?.dispose();
		this.sftpSync.dispose();
	}
}