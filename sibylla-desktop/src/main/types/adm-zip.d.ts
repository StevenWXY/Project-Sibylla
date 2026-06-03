declare module 'adm-zip' {
  interface IZipEntry {
    entryName: string
    header: { size: number }
    isDirectory: boolean
    getData(): Buffer
  }

  class AdmZip {
    constructor(filePath?: string)
    addLocalFolder(localPath: string): void
    getEntries(): IZipEntry[]
    extractAllTo(targetPath: string, overwrite?: boolean): void
    writeZip(targetPath: string): void
  }

  export = AdmZip
  export { IZipEntry }
}
