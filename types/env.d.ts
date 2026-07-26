declare const process: {
  env: Record<string, string | undefined>;
  pid: number;
  cwd(): string;
};
