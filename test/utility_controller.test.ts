// controller.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { vi } from 'vitest';
import axios from 'axios';
import path from 'path';
import { promises as fss } from 'fs';

import {
    get_npm_package_name,
    getGitHubRepoNameFromUrl,
    isValidIdFormat,
    removeEscapingBackslashes,
    get_current_date,
    getDirectorySize,
    findPackageJson,
    getURLFromPackageJson,
    getNameFromPackageJson,
    extractReadmeAsync,
    get_repo_url,
    getPackagesFromPackageJson
} from '../src/controllers/utility_controller'; // Adjust path as needed

describe('Controller Utilities', () => {
    let readdirSyncMock: jest.Mock;
    let statSyncMock: jest.Mock;
    let readFileSyncMock: jest.Mock;
    let fssReaddirMock: jest.Mock;
    let fssReadFileMock: jest.Mock;
    let axiosGetMock: jest.Mock;

    beforeEach(() => {
        // Spy on fs methods
        readdirSyncMock = vi.spyOn(fs, 'readdirSync') as unknown as jest.Mock;
        statSyncMock = vi.spyOn(fs, 'statSync') as unknown as jest.Mock;
        readFileSyncMock = vi.spyOn(fs, 'readFileSync') as unknown as jest.Mock;

        // Spy on fss methods
        fssReaddirMock = vi.spyOn(fss, 'readdir') as unknown as jest.Mock;
        fssReadFileMock = vi.spyOn(fss, 'readFile') as unknown as jest.Mock;

        // Spy on axios.get
        axiosGetMock = vi.spyOn(axios, 'get') as unknown as jest.Mock;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Pure Functions', () => {
        it('isValidIdFormat should validate IDs correctly', () => {
            expect(isValidIdFormat('abc123')).toBe(true);
            expect(isValidIdFormat('user-001')).toBe(true);
            expect(isValidIdFormat('invalid id')).toBe(false);
            expect(isValidIdFormat('abc_123')).toBe(false);
        });

        it('get_npm_package_name should return last part of path', () => {
            expect(get_npm_package_name('/path/to/package')).toBe('package');
            expect(get_npm_package_name('just-one-level')).toBe('just-one-level');
        });

        it('removeEscapingBackslashes should remove escaping backslashes', () => {
            expect(removeEscapingBackslashes('Hello\\nWorld')).toBe('HellonWorld');
            expect(removeEscapingBackslashes('Path\\tHere')).toBe('PathtHere');
        });

        it('get_current_date should return a date string in YYYY-MM-DD HH:MM format', () => {
            const dateStr = get_current_date();
            const regex = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/;
            expect(regex.test(dateStr)).toBe(true);
        });

        it('getGitHubRepoNameFromUrl should extract repo name from GitHub URL', () => {
            expect(getGitHubRepoNameFromUrl('https://github.com/owner/repo')).toBe('repo');
            expect(getGitHubRepoNameFromUrl('https://notgithub.com/owner/')).toBeNull();
        });
    });

    describe('File System Dependent Functions', () => {
        it('findPackageJson should return the path if package.json found at root', () => {
            readdirSyncMock.mockReturnValue(['package.json']);
            statSyncMock.mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);

            const result = findPackageJson('/some/dir');
            expect(result).toBe(path.join('/some/dir', 'package.json'));
        });

        it('findPackageJson should return null if no package.json found', () => {
            readdirSyncMock.mockReturnValue(['file.js']);
            statSyncMock.mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);

            const result = findPackageJson('/some/dir');
            expect(result).toBeNull();
        });

        it('getDirectorySize should sum file sizes recursively', () => {
            // Mock directory structure:
            // /root
            //   file1 (100 bytes)
            //   subdir/
            //     file2 (200 bytes)
            readdirSyncMock.mockImplementation((dirPath: string) => {
                if (dirPath === '/root') return ['file1', 'subdir'];
                if (dirPath === '/root/subdir') return ['file2'];
                return [];
            });
            statSyncMock.mockImplementation((filePath: string) => {
                if (filePath === '/root/file1') return { isDirectory: () => false } as fs.Stats;
                if (filePath === '/root/subdir') return { isDirectory: () => true } as fs.Stats;
                if (filePath === '/root/subdir/file2') return { isDirectory: () => false } as fs.Stats;
                return { isDirectory: () => false, size:150 } as fs.Stats;
            });

            const size = getDirectorySize('/root');
            expect(size).toBe(300);
        });

        // it('getPackagesFromPackageJson should return dependencies from package.json', () => {
        //     const packageJsonContent = JSON.stringify({ dependencies: { react: "^17.0.0", axios: "^0.21.0" } });
        //     readFileSyncMock.mockReturnValue(packageJsonContent);
        //     readdirSyncMock.mockImplementation((dir) => {
        //         if (dir === '/proj') return ['package.json'];
        //         return [];
        //     });
        //     statSyncMock.mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);

        //     const packages = getPackagesFromPackageJson('/proj');
        //     expect(packages).toEqual(['react', 'axios']);
        // });

        // it('getNameFromPackageJson should return name from package.json', () => {
        //     const packageJsonContent = JSON.stringify({ name: "my-package" });
        //     readFileSyncMock.mockReturnValue(packageJsonContent);
        //     readdirSyncMock.mockReturnValue(['package.json']);
        //     statSyncMock.mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);

        //     const name = getNameFromPackageJson('/proj');
        //     expect(name).toBe('my-package');
        // });

        // it('getURLFromPackageJson should return repository URL if present', () => {
        //     const packageJsonContent = JSON.stringify({ repository: { url: 'git://github.com/owner/repo.git' } });
        //     readFileSyncMock.mockReturnValue(packageJsonContent);
        //     readdirSyncMock.mockReturnValue(['package.json']);
        //     statSyncMock.mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats);

        //     const url = getURLFromPackageJson('/proj');
        //     expect(url).toBe('https://github.com/owner/repo');
        // });

        it('extractReadmeAsync should return plain text of README if found', async () => {
            fssReaddirMock.mockResolvedValue(['README.md']);
            fssReadFileMock.mockResolvedValue('# Title\n\nSome content.');
            const text = await extractReadmeAsync('/extracted');
            expect(text).toBe('Title\nSome content.');
        });

        it('extractReadmeAsync should return null if no README found', async () => {
            fssReaddirMock.mockResolvedValue(['file.js']);
            const text = await extractReadmeAsync('/extracted');
            expect(text).toBeNull();
        });
    });

    describe('Network Dependent Functions', () => {
      it('get_repo_url should return cleaned GitHub URL if found', async () => {
        axiosGetMock.mockResolvedValue({ data: { repository: { url: 'git+https://github.com/owner/repo.git' } } });
        const url = await get_repo_url('test-package');
        expect(url).toBe('https://github.com/owner/repo');
      });

      it('get_repo_url should return null if no GitHub URL found', async () => {
        axiosGetMock.mockResolvedValue({ data: {} });
        const url = await get_repo_url('test-package');
        expect(url).toBeNull();
      });
    });
});
 