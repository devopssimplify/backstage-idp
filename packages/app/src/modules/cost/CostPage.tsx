import React, { useEffect, useState } from 'react';
import {
  useApi,
  fetchApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import {
  Page,
  Header,
  Content,
  ContentHeader,
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
  makeStyles,
} from '@material-ui/core';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';

const useStyles = makeStyles(theme => ({
  summaryCard: {
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  amount: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: theme.palette.primary.main,
  },
  networkCode: {
    fontWeight: 'bold',
  },
  tableHeader: {
    backgroundColor: theme.palette.background.default,
  },
  chip: {
    fontWeight: 'bold',
  },
  noData: {
    padding: theme.spacing(4),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
}));

type CostSummary = {
  network_code: string;
  total_cost: number;
  currency: string;
};

type MonthlyCost = {
  network_code: string;
  total_cost: number;
  currency: string;
  month: string;
};

type ServiceBreakdown = {
  service: string;
  total_cost: number;
  currency: string;
};

const formatCost = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
  }).format(amount);

export const CostInsightsPage = () => {
  const classes = useStyles();
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [summary, setSummary] = useState<CostSummary[]>([]);
  const [monthly, setMonthly] = useState<MonthlyCost[]>([]);
  const [breakdown, setBreakdown] = useState<ServiceBreakdown[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('cost');

        const [summaryRes, monthlyRes] = await Promise.all([
          fetchApi.fetch(`${baseUrl}/costs/summary`),
          fetchApi.fetch(`${baseUrl}/costs?months=3`),
        ]);

        if (!summaryRes.ok || !monthlyRes.ok) {
          throw new Error('Failed to load billing data from backend');
        }

        const summaryData = await summaryRes.json();
        const monthlyData = await monthlyRes.json();

        setSummary(summaryData.summary || []);
        setMonthly(monthlyData.costs || []);
      } catch (e: any) {
        setError(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchApi, discoveryApi]);

  const loadBreakdown = async (networkCode: string) => {
    setSelectedCode(networkCode);
    try {
      const baseUrl = await discoveryApi.getBaseUrl('cost');
      const res = await fetchApi.fetch(
        `${baseUrl}/costs/breakdown?networkCode=${encodeURIComponent(networkCode)}`,
      );
      const data = await res.json();
      setBreakdown(data.breakdown || []);
    } catch {
      setBreakdown([]);
    }
  };

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;

  const networkCodes = [...new Set(monthly.map(r => r.network_code))];

  return (
    <Page themeId="tool">
      <Header
        title="GCP Cost Insights"
        subtitle="Billing chargeback by network code — current month"
      />
      <Content>
        {summary.length === 0 ? (
          <InfoCard title="No billing data available">
            <Typography className={classes.noData}>
              GCP billing export to BigQuery has not populated yet (takes up to
              24h after enabling). Check back tomorrow.
            </Typography>
          </InfoCard>
        ) : (
          <Grid container spacing={3}>
            {/* Summary cards per network code */}
            <Grid item xs={12}>
              <ContentHeader title="Current Month by Network Code" />
            </Grid>
            {summary.map(row => (
              <Grid item xs={12} sm={6} md={3} key={row.network_code}>
                <InfoCard
                  title={row.network_code}
                  action={<AttachMoneyIcon />}
                  noPadding
                >
                  <div className={classes.summaryCard}>
                    <Typography className={classes.amount}>
                      {formatCost(row.total_cost, row.currency)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {row.currency} — current month
                    </Typography>
                    <br />
                    <Chip
                      className={classes.chip}
                      size="small"
                      label="View breakdown"
                      color="primary"
                      clickable
                      onClick={() => loadBreakdown(row.network_code)}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                </InfoCard>
              </Grid>
            ))}

            {/* Service breakdown for selected network code */}
            {selectedCode && breakdown.length > 0 && (
              <Grid item xs={12}>
                <InfoCard
                  title={`Service Breakdown — ${selectedCode} (current month)`}
                >
                  <TableContainer>
                    <Table size="small">
                      <TableHead className={classes.tableHeader}>
                        <TableRow>
                          <TableCell>GCP Service</TableCell>
                          <TableCell align="right">Cost</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {breakdown.map(row => (
                          <TableRow key={row.service}>
                            <TableCell>{row.service}</TableCell>
                            <TableCell align="right">
                              {formatCost(row.total_cost, row.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </InfoCard>
              </Grid>
            )}

            {/* Monthly trend table */}
            <Grid item xs={12}>
              <ContentHeader title="3-Month Trend by Network Code" />
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead className={classes.tableHeader}>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      {networkCodes.map(code => (
                        <TableCell key={code} align="right">
                          {code}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...new Set(monthly.map(r => r.month))]
                      .sort()
                      .reverse()
                      .map(month => (
                        <TableRow key={month}>
                          <TableCell>{month}</TableCell>
                          {networkCodes.map(code => {
                            const row = monthly.find(
                              r =>
                                r.month === month && r.network_code === code,
                            );
                            return (
                              <TableCell key={code} align="right">
                                {row
                                  ? formatCost(row.total_cost, row.currency)
                                  : '—'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        )}
      </Content>
    </Page>
  );
};
