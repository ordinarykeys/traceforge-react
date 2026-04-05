import type { EasyLanguageParameter, EasyLanguageRunner } from './types'

const INDENT = '    '

const buildParameterLines = (parameters: EasyLanguageParameter[]): string[] => {
  return [
    '.参数 script, 文本型, , 常量JS脚本',
    ...parameters.map((parameter, index) => `.参数 ${parameter.name}, 文本型, , ${parameter.comment || `参数${index + 1}`}`),
  ]
}

export const quoteParam = (name: string): string => {
  return `" + #引号 + ${name} + #引号 + "`
}

export const buildEasyLanguageTemplate = (
  _scriptOrRunner: string | EasyLanguageRunner,
  maybeRunner?: EasyLanguageRunner
): string => {
  const runner = typeof _scriptOrRunner === 'string' ? maybeRunner! : _scriptOrRunner
  const lines = [
    '.版本 2',
    '',
    `.子程序 WT_JS_Eval, 文本型, , ${runner.description || 'WT-JS_DEBUG'}`,
    ...buildParameterLines(runner.parameters),
    '.局部变量 js, 对象',
    '.局部变量 eval, 变体型',
    '.局部变量 ret, 文本型',
    '',
    "' CoInitialize (0) 线程中使用 加载COM",
    'js.创建 (“ScriptControl”, )',
    'js.写属性 (“Language”, “JScript”)',
    "' 如果调试结果与工具不符，有可能是编码问题，尝试加入： 【 编码_Utf8到Ansi (到字节集 (script)) 】",
    'js.逻辑方法 (“AddCode”, script)',
    `eval ＝ js.通用方法 (“Eval”, "${runner.evalExpression}")`,
    'ret ＝ eval.取文本 ()',
    'js.清除 ()',
    "' CoUninitialize () 线程中使用 卸载COM",
    '返回 (ret)',
  ]

  return lines
    .map((line) => (line.startsWith('.') || line.startsWith("'") || line === '' ? line : `${INDENT}${line}`))
    .join('\n')
}
