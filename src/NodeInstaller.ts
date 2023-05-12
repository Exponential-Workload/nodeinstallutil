import { SemVer } from 'semver';
import { execSync } from 'child_process';
import PMHelper, { PackageManager } from './PMHelper';
import PathHelper from './PathHelper';
import { Ansi, HTTP, TTY } from '@rco3/ttyutil'
import proc from 'process';
import path from 'path'
import { chmodSync, createLinkSync, ensureDirSync, ensureFileSync, exists, existsSync, linkSync, moveSync, readdirSync, readlinkSync, renameSync, rmSync } from 'fs-extra';
import _7z from '7zip-min';

/** Version Check Values */
export enum VersionCheck {
  UpToDate,
  Outdated,
  NotInstalled,
}

/** Installation Status */
export enum InstallStatus {
  Installed,
  NotInstalled,
  RestartSystemOrProcess,
}

/** Node Installation Abstraction */
export default class NodeInstaller {
  static baseNodePath = 'https://nodejs.org/dist/';
  static nodeVersion = proc.versions.node;
  /** NodeJS Executable Install URLs */
  static get NodeURL(): string {
    return `${this.baseNodePath}v${this.nodeVersion}/node-v${proc.versions.node}-${proc.platform}-${proc.arch}.${proc.platform === 'win32' ? '7z' : 'tar.gz'}`
  }
  /** System NodeJS Version */
  static #sysNodeVer?: string | false;
  /** Returns the system nodejs version */
  static getSystemVer(): false | SemVer | undefined {
    let v: string | false | undefined = undefined
    try {
      v = this.#sysNodeVer ?? execSync(`"${(new PathHelper).search('node', proc.platform === 'win32')}" --version`, {}).toString('utf-8').replace('v', '');
    } catch (error) {
      return undefined;
    }
    this.#sysNodeVer = v;
    return typeof v === 'string' ? new SemVer(v) : v;
  }
  /** Returns true if sys node version >= proc node version */
  static checkSystemVer(ourVersion = proc.versions.node): VersionCheck {
    const version = this.getSystemVer();
    if (!version)
      return VersionCheck.NotInstalled;
    const compared = version.compare(ourVersion)
    return compared === -1 ? VersionCheck.Outdated : VersionCheck.UpToDate
  }
  /** Returns true if node is installed */
  static isNodeInstalled(): boolean {
    return this.checkSystemVer() !== VersionCheck.NotInstalled
  }
  /** Returns true if node is installed and up to date */
  static isNodeUpToDate(): boolean {
    return this.checkSystemVer() === VersionCheck.UpToDate
  }
  static install_pm(): boolean {
    const pm = new PMHelper();
    pm.PackageManagerInstallCommands[PackageManager.pnpm] = 'pnpm env use --global'
    const [installed] = pm.install({
      [PackageManager.pnpm]: 'latest',
      [PackageManager.apt]: 'nodejs',
      [PackageManager.pacman]: 'nodejs',
      [PackageManager.yay]: 'nodejs',
      [PackageManager.pamac]: 'nodejs',
      [PackageManager.npm]: 'node',
    })
    return installed;
  }
  static async install(usePm = true): Promise<boolean> {
    if (usePm) {
      if (!this.install_pm())
        console.warn(`Could not install nodejs using Package Manager - Falling back to manual installation`);
      else return true;
    }
    const tty = new TTY();
    const pathHelper = new PathHelper();
    if (proc.platform === 'linux' || proc.platform === 'darwin' || proc.argv.includes('--force-manual-node') || proc.argv.includes('--force')) {
      const curlEquivalent: 'curl' | 'wget' | 'fetch' = pathHelper.search('curl', false) ? 'curl' : pathHelper.search('wget', false) ? 'wget' : 'fetch';
      const spl = this.NodeURL.split('.');
      const tmpDir = path.join(proc.cwd(), 'tmp')
      const outFile = path.join(tmpDir, `nodejs.${spl.pop()}${proc.platform === 'win32' ? '' : `.${spl.pop()}`}`)
      try {
        if (existsSync(tmpDir))
          rmSync(tmpDir, { recursive: true })
        ensureDirSync(tmpDir)
      } catch (error) {
        console.error(error);
        throw new Error(`Could not write to ${tmpDir} - You may need to rerun as root`)
      }
      switch (curlEquivalent) {
        case 'curl':
          execSync(`curl -o ${outFile} ${this.NodeURL}`, {
            stdio: 'inherit'
          });
          break;
        case 'wget':
          execSync(`wget -O ${outFile} ${this.NodeURL}`, {
            stdio: 'inherit'
          });
          break;
        case 'fetch':
          await HTTP.Download(this.NodeURL, path.join(proc.cwd(), outFile));
          break;
      }
      let destination: string = '';
      if (pathHelper.includes(proc.env.HOME + '/bin'))
        destination = proc.env.HOME + '/bin'
      else if (pathHelper.includes(proc.env.HOME + '/.bin'))
        destination = proc.env.HOME + '/.bin'
      else if (pathHelper.includes('/usr/local/bin'))
        destination = '/usr/local/bin'
      else if (pathHelper.includes('/usr/bin'))
        destination = '/usr/bin'
      else destination = pathHelper.PATH[pathHelper.PATH.length - 1] // if this hits anywhehre that isnt windows istg
      const testBinFile = path.join(destination, 'test-node-install-dir-perms')
      try {
        ensureFileSync(testBinFile)
        rmSync(testBinFile)
      } catch (error) {
        console.error(error);
        throw new Error(`Could not write to ${testBinFile} - You may need to rerun as root`)
      }
      await new Promise(rs =>
        _7z.unpack(outFile, tmpDir, (err) => {
          if (err)
            throw err;
          rs(void 0)
        }))
      const base = 'node-v' + this.nodeVersion + '-' + proc.platform + '-' + proc.arch
      const tarFile = path.join(tmpDir, base + '.tar')
      if (!existsSync(tarFile))
        throw new Error('Could not find extracted tar file')
      await new Promise(rs =>
        _7z.unpack(tarFile, tmpDir, (err) => {
          if (err)
            throw err;
          rs(void 0)
        }))
      const nodeDir = path.join(destination, 'node-' + this.nodeVersion)
      if (existsSync(nodeDir))
        rmSync(nodeDir, { recursive: true })
      moveSync(path.join(tmpDir, base), nodeDir)
      const binDir = path.join(nodeDir, 'bin')
      const files = readdirSync(binDir)
      for (const file of files) {
        let link = true
        if (existsSync(path.join(destination, file))) {
          if (readlinkSync(path.join(destination, file)) === path.join(binDir, file))
            link = false
          else if (proc.argv.includes('--force-node-link') || proc.argv.includes('--force'))
            rmSync(path.join(destination, file))
          else
            link = false;
        }
        if (link)
          linkSync(path.join(binDir, file), path.join(destination, file))
        // if not windows, chmod +x
        if (proc.platform !== 'win32')
          chmodSync(path.join(destination, file), '755')
      }
    }
    // On win32, install pnpm
    else if (proc.platform === 'win32' && !pathHelper.search('pnpm', true) && !proc.argv.includes('--no-pnpm')) {
      try {
        execSync(`powershell -command "iwr https://get.pnpm.io/install.ps1 -useb | iex" -executionpolicy bypass`, {
          stdio: 'inherit'
        });
        if (!pathHelper.search('pnpm', true)) {
          console.log(tty.center(`${Ansi.blue()}Please restart your ${proc.platform === 'win32' ? 'system' : 'terminal'}.${Ansi.reset()}`));
          await new Promise((resolve) => setTimeout(resolve, 5000))
          proc.exit()
        } else {
          execSync('pnpm env use --global latest', {
            stdio: 'inherit'
          })
        }
      } catch (error) { }
    } else throw new Error('Could not install nodejs on this platform (or you specified --no-pnpm on windows, preventing pnpm from being installed)')
    return !!0
  }
}