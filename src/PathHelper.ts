import { readdirSync } from "fs";
import { existsSync } from "fs-extra";
import { join } from "path";
import proc from 'process';

const platsep = proc.platform === 'win32' ? ';' : ':';

export default class PathHelper {
  PATH: string[] = [];
  constructor(PATH: string = proc.env.PATH ?? '') {
    this.setPath(PATH)
  }
  /** Adds a path to the searched path */
  public addPath(path: string) {
    this.PATH.push(path)
    return this
  }
  /** Returns the path */
  public getPath() {
    return this.PATH.join(platsep)
  }
  /** Sets the path */
  public setPath(path: string = proc.env.PATH ?? '') {
    this.PATH = path.split(platsep).filter((v, i, a) => a.indexOf(v) === i)
    return this
  }
  /** Removes a directory from the path */
  public removePath(path: string) {
    this.PATH = this.PATH.filter(v => v !== path)
    return this
  }
  /** Searches for an item matching a given function in the path */
  public searchPath(searchFn: (path: string) => boolean) {
    return this.PATH.find(x => existsSync(x) ? searchFn(x) : false)
  }
  /** Searches for a dir in the Path */
  public includes(path: string) {
    return this.searchPath(v => v === path)
  }
  /** Searches for an item in the Path */
  public has(path: string) {
    return this.searchPath(v => existsSync(join(v, path)))
  }
  /** Searches for an item in the Path */
  public search(path: string, caseInsensitive: boolean = false) {
    const exact = this.has(path);
    if (!exact && caseInsensitive)
      path = path.toLowerCase()
    let x: string | false = false;
    const pathHasItem = !!this.searchPath((i) => {
      readdirSync(i).forEach(f => {
        if (caseInsensitive ? f.toLowerCase() === path : f === path)
          if (existsSync(join(i, f)))
            x = join(i, f)
      })
      return !!x
    })

    return (pathHasItem && x) ? x : undefined
  }
}