import fs from 'fs';

export class Logger {
  private fileName: string;

  constructor(fileName: string = '/tmp/server_log.txt') {

    this.fileName = fileName;
    console.log(`Log file path: ${this.fileName}`);

    try {
      // Delete the log file if it exists
      if (fs.existsSync(this.fileName)) {
        fs.unlinkSync(this.fileName);
      }

      // Initialize the log file with a starting message
      this.writeToFile(`Logger started at ${new Date().toISOString()}`);
      this.writeToFile("=".repeat(50));
    } catch (error) {
      console.error(`Failed to initialize logger: ${error}`);
    }
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.fileName, message + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  public log(message: string): void {
    const timestamp = new Date().toISOString();
    this.writeToFile(`[${timestamp}] ${message}`);
  }

  public logError(message: string): void {
    const timestamp = new Date().toISOString();
    this.writeToFile(`[${timestamp}] ERROR: ${message}`);
  }
}
