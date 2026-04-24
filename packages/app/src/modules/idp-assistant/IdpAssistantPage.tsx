import { useState } from 'react';
import { useApi, fetchApiRef, discoveryApiRef } from '@backstage/core-plugin-api';
import { Page, Header, Content } from '@backstage/core-components';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  makeStyles,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import ClearIcon from '@material-ui/icons/Clear';
import BuildIcon from '@material-ui/icons/Build';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidChart } from './MermaidChart';

const EXAMPLES = [
  'List all environments',
  'Show resources for pds-515',
  'What apps are deployed to pds-515?',
  'Show current month cost summary',
  'Show cost breakdown for cn580004',
  'List all GitHub repos',
  'Show recent workflow runs for backstage-idp',
  'Show failed pipelines for idp-poc-gitops',
  'List open PRs for backstage-idp',
  'Draw a pie chart of cost by service',
  'Show cost trends as a bar chart',
];

const TOOL_LABELS: Record<string, string> = {
  list_environments: 'Listing environments',
  get_environment_resources: 'Fetching resources',
  list_applications: 'Fetching applications',
  list_systems: 'Listing systems',
  get_entity: 'Looking up entity',
  get_cost_summary: 'Fetching cost summary',
  get_cost_trends: 'Fetching cost trends',
  get_cost_breakdown: 'Fetching cost breakdown',
  list_github_repos: 'Listing GitHub repos',
  list_repo_workflows: 'Listing workflows',
  list_workflow_runs: 'Fetching pipeline runs',
  get_workflow_run: 'Fetching run details',
  list_pull_requests: 'Fetching pull requests',
};

const useStyles = makeStyles(theme => ({
  responseCard: {
    padding: theme.spacing(2.5),
    minHeight: 220,
    backgroundColor: theme.palette.background.default,
    fontSize: 14,
    lineHeight: 1.7,
    wordBreak: 'break-word',
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    '& h1, & h2, & h3, & h4': {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
      fontWeight: 600,
    },
    '& h1': { fontSize: '1.5em' },
    '& h2': { fontSize: '1.3em' },
    '& h3': { fontSize: '1.1em' },
    '& p': { marginBottom: theme.spacing(1) },
    '& ul, & ol': { paddingLeft: theme.spacing(3), marginBottom: theme.spacing(1) },
    '& li': { marginBottom: theme.spacing(0.25) },
    '& code': {
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderRadius: 3,
      padding: '1px 5px',
      fontFamily: 'monospace',
      fontSize: '0.9em',
    },
    '& pre': {
      backgroundColor: 'rgba(0,0,0,0.3)',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 6,
      padding: theme.spacing(1.5),
      overflowX: 'auto',
      marginBottom: theme.spacing(1),
      '& code': {
        background: 'none',
        padding: 0,
        fontSize: '0.88em',
      },
    },
    '& table': {
      borderCollapse: 'collapse',
      width: '100%',
      marginBottom: theme.spacing(1.5),
      fontSize: 13,
    },
    '& th': {
      backgroundColor: 'rgba(255,255,255,0.06)',
      fontWeight: 600,
      textAlign: 'left',
      padding: '6px 10px',
      borderBottom: `2px solid ${theme.palette.divider}`,
    },
    '& td': {
      padding: '5px 10px',
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    '& tr:hover td': {
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    '& blockquote': {
      borderLeft: `3px solid ${theme.palette.primary.main}`,
      paddingLeft: theme.spacing(1.5),
      color: theme.palette.text.secondary,
      margin: `${theme.spacing(1)}px 0`,
    },
    '& strong': { fontWeight: 700 },
    '& em': { fontStyle: 'italic' },
    '& a': { color: theme.palette.primary.main },
    '& hr': { border: 'none', borderTop: `1px solid ${theme.palette.divider}`, margin: `${theme.spacing(2)}px 0` },
  },
  toolRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    minHeight: 32,
    alignItems: 'center',
  },
  inputRow: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-end',
  },
  exampleChip: {
    cursor: 'pointer',
  },
  placeholder: {
    color: theme.palette.text.disabled,
    fontStyle: 'italic',
  },
  errorText: {
    color: theme.palette.error.main,
  },
}));

type ToolEvent = { name: string; done: boolean };

const CodeBlock = ({
  inline,
  className,
  children,
  ...props
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) => {
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  const code = String(children).replace(/\n$/, '');

  if (!inline && language === 'mermaid') {
    return <MermaidChart chart={code} />;
  }

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <pre>
      <code className={className} {...props}>
        {children}
      </code>
    </pre>
  );
};

export const IdpAssistantPage = () => {
  const classes = useStyles();
  const fetchApi = useApi(fetchApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  const reset = () => {
    setResponse('');
    setToolEvents([]);
    setError(null);
    setAsked(false);
  };

  const handleQuery = async () => {
    if (!question.trim() || loading) return;

    setLoading(true);
    setResponse('');
    setToolEvents([]);
    setError(null);
    setAsked(true);

    try {
      const baseUrl = await discoveryApi.getBaseUrl('idp-assistant');
      const res = await fetchApi.fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === 'text') {
            setResponse(prev => prev + event.content);
          } else if (event.type === 'tool_start') {
            setToolEvents(prev => [...prev, { name: event.name, done: false }]);
          } else if (event.type === 'tool_done') {
            setToolEvents(prev =>
              prev.map(t => (t.name === event.name && !t.done ? { ...t, done: true } : t)),
            );
          } else if (event.type === 'error') {
            setError(event.message);
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleQuery();
    }
  };

  return (
    <Page themeId="tool">
      <Header
        title="IDP Assistant"
        subtitle="Ask natural-language questions about your infrastructure"
      />
      <Content>
        <Grid container spacing={3}>
          {/* Input card */}
          <Grid item xs={12}>
            <Paper elevation={2} style={{ padding: 20 }}>
              <Typography variant="subtitle2" gutterBottom>
                Ask a question
              </Typography>
              <Box className={classes.inputRow}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={6}
                  variant="outlined"
                  placeholder="e.g. List all environments  •  Show resources for pds-515  •  Draw a pie chart of cost by service"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  size="small"
                  helperText="Ctrl+Enter to submit"
                />
                <Box display="flex" flexDirection="column" style={{ gap: 8 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleQuery}
                    disabled={loading || !question.trim()}
                    startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                    style={{ whiteSpace: 'nowrap', minWidth: 100 }}
                  >
                    {loading ? 'Thinking…' : 'Ask'}
                  </Button>
                  {asked && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ClearIcon />}
                      onClick={reset}
                    >
                      Clear
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Example queries */}
              <Box mt={1.5}>
                <Typography variant="caption" color="textSecondary">
                  Try:{' '}
                </Typography>
                {EXAMPLES.map(ex => (
                  <Chip
                    key={ex}
                    className={classes.exampleChip}
                    size="small"
                    label={ex}
                    variant="outlined"
                    onClick={() => {
                      setQuestion(ex);
                      reset();
                    }}
                    style={{ margin: '2px 4px' }}
                  />
                ))}
              </Box>
            </Paper>
          </Grid>

          {/* Tool activity */}
          {toolEvents.length > 0 && (
            <Grid item xs={12}>
              <Box className={classes.toolRow}>
                <Typography variant="caption" color="textSecondary">
                  Tools used:
                </Typography>
                {toolEvents.map((t, i) => (
                  <Chip
                    key={`${t.name}-${i}`}
                    size="small"
                    icon={t.done ? <CheckCircleOutlineIcon /> : <BuildIcon />}
                    label={TOOL_LABELS[t.name] ?? t.name}
                    color={t.done ? 'default' : 'primary'}
                    variant={t.done ? 'outlined' : 'default'}
                  />
                ))}
                {loading && <CircularProgress size={14} />}
              </Box>
            </Grid>
          )}

          {/* Response */}
          {(asked || error) && (
            <Grid item xs={12}>
              <Paper elevation={1}>
                <Box className={classes.responseCard}>
                  {error ? (
                    <Typography className={classes.errorText}>Error: {error}</Typography>
                  ) : response ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ code: CodeBlock as any }}
                    >
                      {response}
                    </ReactMarkdown>
                  ) : loading ? (
                    <Typography className={classes.placeholder}>Fetching data…</Typography>
                  ) : null}
                </Box>
              </Paper>
            </Grid>
          )}
        </Grid>
      </Content>
    </Page>
  );
};
