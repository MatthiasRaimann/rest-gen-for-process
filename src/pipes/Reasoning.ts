import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Reasoning, Z_Reasoning } from 'src/models/Reasoning';

@Injectable()
export class ReasoningPipe implements PipeTransform {
  transform(value: any): Reasoning {
    const temp = Z_Reasoning.safeParse(value);
    if (temp.success) {
      return temp.data;
    } else {
      throw new BadRequestException('Invalid data format!');
    }
  }
}
