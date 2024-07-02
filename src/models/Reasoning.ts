import { z } from 'zod';

export const Z_Reasoning = z.object({
  reasoning: z.string(),
});

export type Reasoning = z.infer<typeof Z_Reasoning>;
