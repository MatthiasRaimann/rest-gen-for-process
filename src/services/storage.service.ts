import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

@Injectable()
export class StorageService {
  dataPath = join(dirname(require.main.filename), '..', 'data-store.json');

  private getAll(): object {
    return JSON.parse(readFileSync(this.dataPath, 'utf8'));
  }

  private persistAll(data: object): void {
    return writeFileSync(this.dataPath, JSON.stringify(data));
  }

  getValue(name: string): string {
    return this.getAll()[name] ?? '';
  }

  setValue(name: string, value: string): void {
    const data = this.getAll();
    data[name] = value;
    this.persistAll(data);
  }
}
