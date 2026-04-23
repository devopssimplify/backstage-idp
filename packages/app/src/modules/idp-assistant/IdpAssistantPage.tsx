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

const EXAMPLES = [
  'List all environments',
  'Show resources for pds-515',
  'What apps are deployed to pds-515?',
  'List all network codes',
  'Show all systems in the catalog',
];

const TOOL_LABELS: Record<string, string> = {
  list_environments: 'Listing environments',
  get_environment_resources: 'Fetching resources',
  list_applications: 'Fetching applications',
  list_systems: 'Listing systems',
  get_entity: 'Looking up entity',
};

const useStyles = makeStyles(theme => ({
  responseCard: {
    padding: theme.spacing(2.5),
    minHeight: 220,
    backgroundColor: theme.palette.background.default,
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
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
                  placeholder="e.g. List all environments  •  Show resources for pds-515  •  What apps are in pds-515?"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  size="small"
                  helperText="Ctrl+Enter to submit"
                />
                <Box display="flex" flexDirection="column" gap={1}>
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
                    response
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
