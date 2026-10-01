let activeOperation: string | null = null;

export const hasActiveOperation = (): boolean => activeOperation !== null;
export const assertReviewWritable = (): void => {
   if (activeOperation !== "refresh") assertNoActiveOperation();
};

export const assertNoActiveOperation = (): void => {
   if (activeOperation !== null) throw new Error(`Wait for the current ${activeOperation} operation to finish.`);
};

export const runExclusiveOperation = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
   assertNoActiveOperation();
   activeOperation = name;
   try {
      return await run();
   } finally {
      activeOperation = null;
   }
};
