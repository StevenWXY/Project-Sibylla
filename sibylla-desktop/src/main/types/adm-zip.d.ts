declare module 'adm-zip' {
  interface IZipEntry {
    entryName: string
    header: { size: number }
    isDirectory: boolean
    getData(): Buffer
  }

  class AdmZip {
    constructor(filePath: string)
    getEntries(): IZipEntry[]
    extractAllTo(targetPath: string, overwrite?: boolean): void
  }

  export = AdmZip
  export { IZipEntry }
}
