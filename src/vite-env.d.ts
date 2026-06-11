/// <reference types="vite/client" />

declare module 'lunar-javascript' {
  export const Solar: {
    fromDate(date: Date): {
      toYmd(): string;
      getLunar(): {
        toString(): string;
        toFullString(): string;
        getMonthInChinese(): string;
        getDayInChinese(): string;
        getJieQi(): string;
      };
    };
    fromYmd(year: number, month: number, day: number): {
      getLunar(): {
        getMonthInChinese(): string;
        getDayInChinese(): string;
        getJieQi(): string;
      };
    };
  };
}
