import { describe, expect, test } from 'vitest';
import { evaluatePasswordStrength } from '../../../src/utils/passwordStrength';

describe('evaluatePasswordStrength', () => {
  test('空文字は none / score 0', () => {
    expect(evaluatePasswordStrength('')).toMatchObject({ strength: 'none', score: 0 });
  });

  test('6文字未満は none / score 1', () => {
    expect(evaluatePasswordStrength('abc12')).toMatchObject({ strength: 'none', score: 1 });
  });

  test('6文字以上で英字のみ・数字のみは weak / score 2', () => {
    expect(evaluatePasswordStrength('abcdef')).toMatchObject({ strength: 'weak', score: 2 });
    expect(evaluatePasswordStrength('12345678')).toMatchObject({ strength: 'weak', score: 2 });
  });

  test('6〜7文字は英数混在でも weak（8文字未満）', () => {
    expect(evaluatePasswordStrength('abc123')).toMatchObject({ strength: 'weak', score: 2 });
  });

  test('8文字以上で英字+数字は medium / score 3', () => {
    expect(evaluatePasswordStrength('abcd1234')).toMatchObject({ strength: 'medium', score: 3 });
  });

  test('10文字以上でも記号がなければ medium', () => {
    expect(evaluatePasswordStrength('abcde12345')).toMatchObject({ strength: 'medium', score: 3 });
  });

  test('9文字は記号があっても medium（10文字未満）', () => {
    expect(evaluatePasswordStrength('abcd123!x')).toMatchObject({ strength: 'medium', score: 3 });
  });

  test('10文字以上で英字+数字+記号は strong / score 4', () => {
    expect(evaluatePasswordStrength('abcd1234!x')).toMatchObject({ strength: 'strong', score: 4 });
  });

  test('ラベルとヒントは強度に対応する', () => {
    expect(evaluatePasswordStrength('')).toMatchObject({ label: '未入力' });
    expect(evaluatePasswordStrength('abcdef')).toMatchObject({ label: '弱い' });
    expect(evaluatePasswordStrength('abcd1234')).toMatchObject({ label: '普通' });
    expect(evaluatePasswordStrength('abcd1234!x')).toMatchObject({ label: '強い', hint: '強いパスワードです' });
  });
});
