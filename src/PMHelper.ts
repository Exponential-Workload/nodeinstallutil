import { ExecSyncOptionsWithStringEncoding, execSync } from "child_process";
import { PathHelper } from "./PathHelper";

/** Known Package Managers */
export enum PackageManager {
  /** Arch Official Repositories */
  pacman,
  /** Debian Official Repositories */
  apt,
  /** AUR - Unsafe */
  yay,
  /** Node Package Manager */
  pnpm,
  /** Node Package Manager */
  yarn,
  /** Node Package Manager */
  npm,
  /** AUR - Unsafe */
  pamac,
  /** Chocolatey */
  choco,
}
const PackageManagerNames: Record<PackageManager, string> = {
  [PackageManager.pacman]: 'pacman',
  [PackageManager.apt]: 'apt',
  [PackageManager.yay]: 'yay',
  [PackageManager.pnpm]: 'pnpm',
  [PackageManager.yarn]: 'yarn',
  [PackageManager.npm]: 'npm',
  [PackageManager.pamac]: 'pamac',
  [PackageManager.choco]: 'choco',
}
const PackageManagerVersionCommands: Record<PackageManager, string> = {
  [PackageManager.pacman]: 'pacman -V',
  [PackageManager.apt]: 'apt -v',
  [PackageManager.yay]: 'yay -V',
  [PackageManager.pnpm]: 'pnpm -v',
  [PackageManager.yarn]: 'yarn -v',
  [PackageManager.npm]: 'npm -v',
  [PackageManager.pamac]: 'pamac -V',
  [PackageManager.choco]: 'choco -v',
}
const PackageManagerInstallCommands: Record<PackageManager, string> = {
  [PackageManager.pacman]: 'pacman -S --noconfirm',
  [PackageManager.apt]: 'apt install -y',
  [PackageManager.yay]: 'yay -S --noconfirm',
  [PackageManager.pnpm]: 'pnpm install -g',
  [PackageManager.yarn]: 'yarn global add',
  [PackageManager.npm]: 'npm install -g',
  [PackageManager.pamac]: 'pamac install --no-confirm',
  [PackageManager.choco]: 'choco install -y',
}
const PackageManagerRequiresSudo: Record<PackageManager, boolean> = {
  [PackageManager.pacman]: true,
  [PackageManager.apt]: true,
  /** Can require it if package installs from AUR */
  [PackageManager.yay]: false,
  [PackageManager.pnpm]: false,
  [PackageManager.yarn]: false,
  [PackageManager.npm]: false,
  [PackageManager.pamac]: false,
  [PackageManager.choco]: true,
}
export const semverRegex = /(\d+\.\d+\.\d+)/gui
export const semverRegexWithV = /v(\d+\.\d+\.\d+)/gui
const PackageManagerVersionRegexes: Record<PackageManager, RegExp> = {
  [PackageManager.pacman]: semverRegex,
  [PackageManager.apt]: semverRegex,
  [PackageManager.yay]: /yay v(\d+\.\d+\.\d+)/gui,
  [PackageManager.pnpm]: semverRegex,
  [PackageManager.yarn]: semverRegex,
  [PackageManager.npm]: semverRegex,
  [PackageManager.pamac]: semverRegex,
  [PackageManager.choco]: semverRegex,
}

export default class PMHelper {
  public PackageManagerNames = { ...PackageManagerNames };
  public PackageManagerVersionCommands = { ...PackageManagerVersionCommands };
  public PackageManagerRequiresSudo = { ...PackageManagerRequiresSudo };
  public PackageManagerInstallCommands = { ...PackageManagerInstallCommands };
  public PackageManagerVersionRegexes = { ...PackageManagerVersionRegexes };
  public sudoArgs = '--preserve-env' // --askpass
  /** Adds a package manager to this instance - Expect to use a lot of 'as unknown as PackageManager' (better yet, define the PM as a variable & do that once) */
  public addPackageManager(command: string, versionArgs: string, installArgs: string, requiresSudo: boolean, versionRegex: RegExp = semverRegex) {
    const pm = command as unknown as PackageManager
    this.PackageManagerNames[pm] = command
    this.PackageManagerVersionCommands[pm] = versionArgs
    this.PackageManagerInstallCommands[pm] = installArgs
    this.PackageManagerRequiresSudo[pm] = requiresSudo
    this.PackageManagerVersionRegexes[pm] = versionRegex
  }
  /** Adds a package manager to all future instances - Expect to use a lot of 'as unknown as PackageManager' (better yet, define the PM as a variable & do that once) */
  public static addPackageManager(command: string, versionArgs: string, installArgs: string, requiresSudo: boolean, versionRegex: RegExp = semverRegex) {
    const pm = command as unknown as PackageManager
    PackageManagerNames[pm] = command
    PackageManagerVersionCommands[pm] = versionArgs
    PackageManagerInstallCommands[pm] = installArgs
    PackageManagerRequiresSudo[pm] = requiresSudo
    PackageManagerVersionRegexes[pm] = versionRegex
  }
  public installPackageFromPackageManager(packageName: string, packageManager: PackageManager = PackageManager.pacman, execOptions: Partial<ExecSyncOptionsWithStringEncoding> = {}) {
    const command = `${this.PackageManagerInstallCommands[packageManager]} ${packageName}`
    if (this.PackageManagerRequiresSudo[packageManager])
      return execSync(`sudo ${this.sudoArgs} ${command}`, {
        stdio: 'inherit',
        ...execOptions,
      })
    else
      return execSync(command)
  }
  public pathHelper = new PathHelper();
  public isPackageManagerInstalled(packageManager: PackageManager = PackageManager.pacman): boolean {
    return !!this.resolvePackageManagerPath(packageManager)
  }
  public resolvePackageManagerPath(packageManager: PackageManager = PackageManager.pacman): string | undefined {
    return this.pathHelper.search(this.PackageManagerNames[packageManager])
  }
  public getPackageManagerVersion(packageManager: PackageManager = PackageManager.pacman): string | false {
    try {
      return execSync(this.PackageManagerVersionCommands[packageManager]).toString('utf-8').match(this.PackageManagerVersionRegexes[packageManager])?.[1] ?? false
    } catch (error) {
      return false;
    }
  }
  /**
   * Tries to install a package using all provided package managers
   * @param {Partial<Record<PackageManager, string>>} packageInRepos - Object with package managers as keys and package names as values
   * @param {Partial<ExecSyncOptionsWithStringEncoding>} execOptions - Options to pass to execSync
   * @param {boolean} tryUntilSuccess - If true, will try to install using all package managers until one succeeds or the end of the list is reached - If false, will throw an error on PM error, instead of continuing
   * @returns {[installed:true,pmStdout:string|Buffer]|[installed:false]}
   */
  public install(packageInRepos: Partial<Record<PackageManager, string>>, execOptions?: Partial<ExecSyncOptionsWithStringEncoding>, tryUntilSuccess: boolean = false): [true, Buffer | string] | [false] {
    for (const pm in packageInRepos) {
      const PMEnum = Object.values(PackageManager).find(i =>
        (i.toString() === pm || i.toString() === PackageManager[pm as unknown as number]) && typeof i === 'number'
      ) as PackageManager;
      if (packageInRepos[PMEnum]) {
        if (this.isPackageManagerInstalled(PMEnum)) {
          try {
            return [true, this.installPackageFromPackageManager(packageInRepos[PMEnum]!, PMEnum, execOptions ?? {})]
          } catch (error) {
            if (tryUntilSuccess) console.error(error)
            else throw error;
          }
        }
      }
    }
    return [false]
  }
}
