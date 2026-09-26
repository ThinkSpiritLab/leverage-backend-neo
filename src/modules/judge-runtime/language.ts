/** Historical numeric submission language codes; retain accepted public aliases. */
export const LEVERAGE_LANG_TO_BOTZONE: Record<number, string> = {
  3: 'cpp',
  9: 'python',
  10: 'javascript',
  11: 'typescript',
};

export function resolveBotzoneLanguage(value: string): 'cpp' | 'python' | 'javascript' | 'typescript' | undefined {
  switch (value) {
    case 'cpp': case 'cpp17': return 'cpp';
    case 'python': case 'python3': return 'python';
    case 'javascript': return 'javascript';
    case 'typescript': return 'typescript';
    default: return undefined;
  }
}
