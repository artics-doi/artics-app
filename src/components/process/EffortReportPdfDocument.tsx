import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import notoSansJpRegular from '@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff';
import notoSansJpBold from '@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-700-normal.woff';
import {
  compressEffortDailyDetails,
  formatEffortDate,
  formatEffortHours,
  type EffortReportResult,
} from '../../lib/process/effortReport';
import type { ProcessMember } from '../../types/process';

Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: notoSansJpRegular, fontWeight: 400 },
    { src: notoSansJpBold, fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: 'NotoSansJP',
    fontSize: 9,
    color: '#0f172a',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    color: '#475569',
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
  },
  totalBox: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  totalItem: {
    width: '33.333%',
    padding: 7,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  totalLabel: {
    fontSize: 8,
    color: '#64748b',
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    minHeight: 22,
  },
  headerRow: {
    backgroundColor: '#f1f5f9',
    fontWeight: 700,
  },
  cell: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  projectCell: { width: '28%' },
  memberCell: { width: '20%' },
  compactCell: { width: '13%' },
  detailPeriodCell: { width: '16%' },
  detailProjectCell: { width: '16%' },
  detailMemberCell: { width: '14%' },
  detailTaskCell: { width: '30%' },
  detailStatusCell: { width: '10%' },
  detailDaysCell: { width: '7%' },
  detailHoursCell: { width: '7%' },
  warning: {
    padding: 6,
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    marginBottom: 4,
    color: '#92400e',
  },
});

function memberName(memberById: Map<string, ProcessMember>, memberId: string): string {
  return memberById.get(memberId)?.name ?? '不明な担当者';
}

function memberTotals(report: EffortReportResult, memberById: Map<string, ProcessMember>) {
  const totals = new Map<string, {
    memberId: string;
    businessDays: number;
    totalHours: number;
  }>();
  report.projects.forEach((project) => {
    project.memberSummaries.forEach((summary) => {
      const current = totals.get(summary.memberId) ?? {
        memberId: summary.memberId,
        businessDays: 0,
        totalHours: 0,
      };
      current.businessDays += summary.businessDays;
      current.totalHours += summary.totalHours;
      totals.set(summary.memberId, current);
    });
  });
  return [...totals.values()].sort((a, b) =>
    memberName(memberById, a.memberId).localeCompare(memberName(memberById, b.memberId), 'ja'),
  );
}

function statusLabel(status: 'doing' | 'done'): string {
  return status === 'doing' ? '進行中' : '完了';
}

function formatEffortDateRange(start: Date, end: Date): string {
  const startLabel = formatEffortDate(start);
  const endLabel = formatEffortDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export default function EffortReportPdfDocument({
  report,
  members,
  createdByName,
  createdAt,
}: {
  report: EffortReportResult;
  members: ProcessMember[];
  createdByName: string;
  createdAt: Date;
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const projectNameById = new Map(report.projects.map((project) => [project.projectId, project.projectName]));
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');
  const membersSummary = memberTotals(report, memberById);
  const compressedDetails = compressEffortDailyDetails(report)
    .map((detail) => ({
      ...detail,
      projectName: projectNameById.get(detail.projectId) ?? '不明なプロジェクト',
      memberName: memberName(memberById, detail.memberId),
    }))
    .sort((a, b) => {
      if (a.memberName !== b.memberName) return a.memberName.localeCompare(b.memberName, 'ja');
      if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName, 'ja');
      return a.taskTitle.localeCompare(b.taskTitle, 'ja');
    });

  return (
    <Document title={`開発工数_${report.period.fiscalYear}年度`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>年度工数 {report.period.fiscalYear}年度</Text>
        <View style={styles.meta}>
          <Text>年度: {report.period.fiscalYear}年度</Text>
          <Text>対象期間: {formatEffortDate(report.period.start)} - {formatEffortDate(report.period.end)}</Text>
          <Text>作成日: {formatEffortDate(createdAt)}</Text>
          <Text>作成者: {createdByName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>年度合計</Text>
          <View style={styles.totalBox}>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>総工数</Text>
              <Text style={styles.totalValue}>{formatEffortHours(report.totalHours)}</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>計算条件</Text>
              <Text style={styles.totalValue}>1日 = {formatEffortHours(report.hoursPerBusinessDay)}</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalLabel}>警告</Text>
              <Text style={styles.totalValue}>{warnings.length}件</Text>
            </View>
          </View>
        </View>

        {warnings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>警告</Text>
            {warnings.map((warning) => (
              <Text key={warning.id} style={styles.warning}>{warning.message}</Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>プロジェクト別集計</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.projectCell]}>プロジェクト</Text>
              <Text style={[styles.cell, styles.compactCell]}>総工数</Text>
            </View>
            {report.projects.map((project) => (
              <View key={project.projectId} style={styles.row}>
                <Text style={[styles.cell, styles.projectCell]}>{project.projectName}</Text>
                <Text style={[styles.cell, styles.compactCell]}>{formatEffortHours(project.totalHours)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>人別集計</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.memberCell]}>担当者</Text>
              <Text style={[styles.cell, styles.compactCell]}>営業日</Text>
              <Text style={[styles.cell, styles.compactCell]}>総工数</Text>
            </View>
            {membersSummary.map((summary) => (
              <View key={summary.memberId} style={styles.row}>
                <Text style={[styles.cell, styles.memberCell]}>{memberName(memberById, summary.memberId)}</Text>
                <Text style={[styles.cell, styles.compactCell]}>{summary.businessDays}日</Text>
                <Text style={[styles.cell, styles.compactCell]}>{formatEffortHours(summary.totalHours)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>人別・タスク別明細</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.detailMemberCell]}>担当者</Text>
              <Text style={[styles.cell, styles.detailProjectCell]}>プロジェクト</Text>
              <Text style={[styles.cell, styles.detailTaskCell]}>タスク</Text>
              <Text style={[styles.cell, styles.detailStatusCell]}>状態</Text>
              <Text style={[styles.cell, styles.detailPeriodCell]}>対象日</Text>
              <Text style={[styles.cell, styles.detailDaysCell]}>日数</Text>
              <Text style={[styles.cell, styles.detailHoursCell]}>工数</Text>
            </View>
            {compressedDetails.map((detail) => (
              <View key={`${detail.startDateKey}:${detail.endDateKey}:${detail.projectId}:${detail.memberId}:${detail.taskId}`} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.detailMemberCell]}>{detail.memberName}</Text>
                <Text style={[styles.cell, styles.detailProjectCell]}>{detail.projectName}</Text>
                <Text style={[styles.cell, styles.detailTaskCell]}>{detail.taskTitle}</Text>
                <Text style={[styles.cell, styles.detailStatusCell]}>{statusLabel(detail.status)}</Text>
                <Text style={[styles.cell, styles.detailPeriodCell]}>{formatEffortDateRange(detail.startDate, detail.endDate)}</Text>
                <Text style={[styles.cell, styles.detailDaysCell]}>{detail.days}日</Text>
                <Text style={[styles.cell, styles.detailHoursCell]}>{formatEffortHours(detail.totalHours)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
