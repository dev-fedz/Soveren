export interface FormatterDefinition {
  id: string;
  name: string;
  languages: string[];
  extensions: string[];
  command: string;
  configFiles?: string[];
  supportsStdin?: boolean;
  args?: string[];
  installHelp?: string;
  builtinSupported?: boolean;
}

export interface FormatRequest {
  code: string;
  filePath?: string;
  language?: string;
  workspacePath?: string | null;
}

export interface FormatResult {
  success: boolean;
  formatted: string;
  formatterId: string;
  formatterName: string;
  language: string;
  unavailable?: boolean;
  installHelp?: string;
  error?: string;
  syntaxError?: boolean;
}

export interface FormatterConfig {
  formatOnSave: boolean;
  formatters: Record<string, string>; // language -> formatterId
  disabledLanguages: string[];
}
