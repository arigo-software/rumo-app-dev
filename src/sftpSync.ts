import * as vscode from 'vscode';
import Client from 'ssh2-sftp-client';
import * as fs from 'fs';
import * as path from 'path';

const BUILD_TYPE_DIR = 'build/type';

interface SftpConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	remoteRoot: string;
}

export class SftpSync {
	private sftp: Client;
	private config: SftpConfig | undefined;
	private connected: boolean = false;

	constructor() {
		this.sftp = new Client();
		this.loadConfig();
	}

	public loadConfig() {
		const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
		const configPath = path.join(workspaceFolder, '.vscode', 'sftp.json');
		if (fs.existsSync(configPath)) {
			const configFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
			const sftpConfig = configFile; // Use the configuration from sftp.json
			if (sftpConfig) {
				this.config = {
					host: sftpConfig.host,
					port: sftpConfig.port,
					username: sftpConfig.username,
					password: sftpConfig.password,
					remoteRoot: sftpConfig.remotePath
				};
			}
		} else {
			this.config = undefined;
		}
	}

	public async connect(): Promise<void> {
		if (this.config) {
			try {
				await this.sftp.connect({
					host: this.config.host,
					port: this.config.port,
					username: this.config.username,
					password: this.config.password
				});
				this.connected = true;
				vscode.window.showInformationMessage('SFTP connection established');
			} catch (err) {
				this.connected = false;
				vscode.window.showErrorMessage(`SFTP connection error: ${(err as Error).message}`);
				throw err;
			}
		} else {
			this.connected = false;
		}
	}

	public isConnected(): boolean {
		return this.connected;
	}

	private async ensureRemoteDirectory(remotePath: string) {
		const remoteDir = path.dirname(remotePath);
		try {
			const exists = await this.sftp.exists(remoteDir);
			if (!exists) {
				await this.sftp.mkdir(remoteDir, true);
			}
		} catch (err) {
			const errorMessage = (err as Error).message;
			console.error(err);
			if (errorMessage.includes('No SFTP connection available')) {
				await this.reconnect();
				await this.ensureRemoteDirectory(remotePath);
			} else {
				vscode.window.showErrorMessage(`Error creating remote directory: ${errorMessage}`);
				throw err;
			}
		}
	}

	private async handleSftpError(err: Error) {
		if (err.message.includes('No such file') || err.message.includes('Connection lost')) {
			this.connected = false;
			await this.reconnect();
		}
	}

	public async reconnect(): Promise<void> {
		if (this.config) {
			try {
				await this.connect();
				vscode.window.showInformationMessage('SFTP reconnected successfully');
			} catch (err) {
				vscode.window.showErrorMessage(`SFTP reconnection error: ${(err as Error).message}`);
			}
		}
	}

	public async uploadFile(localPath: string) {
		if (this.config) {
			const relativePath = path.relative(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, BUILD_TYPE_DIR), localPath);
			const remotePath = path.join(this.config.remoteRoot, relativePath);
			try {
				await this.ensureRemoteDirectory(remotePath);
				await this.sftp.put(localPath, remotePath);
				vscode.window.showInformationMessage(`File uploaded to: ${remotePath}`);
			} catch (err) {
				await this.handleSftpError(err as Error);
				const errorMessage = (err as Error).message;
				vscode.window.showErrorMessage(`File upload error: ${errorMessage}`);
			}
		}
	}

	public async uploadAllFiles() {
		if (this.config) {
			const buildTypeDir = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, BUILD_TYPE_DIR);
			const files = this.getAllFiles(buildTypeDir, ['.js', '.js.map']);
			for (const file of files) {
				const relativePath = path.relative(buildTypeDir, file);
				const remotePath = path.join(this.config.remoteRoot, relativePath);
				await this.ensureRemoteDirectory(remotePath);
				await this.uploadFile(file);
			}
			vscode.window.showInformationMessage('All JavaScript and map files uploaded');
		}
	}

	private getAllFiles(dir: string, exts: string[], files: string[] = [], result: string[] = []): string[] {
		files = fs.readdirSync(dir);
		for (const file of files) {
			const filePath = path.join(dir, file);
			if (fs.statSync(filePath).isDirectory()) {
				this.getAllFiles(filePath, exts, fs.readdirSync(filePath), result);
			} else if (exts.some(ext => filePath.endsWith(ext))) {
				result.push(filePath);
			}
		}
		return result;
	}

	public async deleteFile(localPath: string) {
		if (this.config) {
			const relativePath = path.relative(path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, BUILD_TYPE_DIR), localPath);
			const remotePath = path.join(this.config.remoteRoot, relativePath);
			try {
				await this.sftp.delete(remotePath);
				vscode.window.showInformationMessage(`File deleted: ${remotePath}`);
			} catch (err) {
				await this.handleSftpError(err as Error);
				const errorMessage = (err as Error).message;
				vscode.window.showErrorMessage(`File delete error: ${errorMessage}`);
			}
		}
	}

	public dispose() {
		this.sftp.end();
		this.connected = false;
	}
}