import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import mysql from 'mysql2/promise';
import OpenAI from 'openai';

const actionDefinition: ActionDefinition = {
  key: 'chatWithYourMysqlDb',
  name: 'Chat with your MySQL DB',
  description: 'Users can send DB requests in natural language and receive data and/or helpful feedback.',
  type: 'read',
  inputParameters: [
    {
      key: 'openaiApiKey',
      name: 'OpenAI API Key',
      description: 'Your OpenAI API key',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'host',
      name: 'Database Host',
      description: 'MySQL database host (e.g., your-server.mysql.database.azure.com)',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'port',
      name: 'Database Port',
      description: 'MySQL database port (default: 3306)',
      type: 'string',
      validation: {
        required: false,
      },
    },
    {
      key: 'sslCert',
      name: 'SSL Certificate',
      description: 'SSL certificate content (PEM format)',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'user',
      name: 'Database User',
      description: 'MySQL database user (should use read-only credentials)',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'password',
      name: 'Database Password',
      description: 'MySQL database password',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'database',
      name: 'Database Name',
      description: 'MySQL database name',
      type: 'string',
      validation: {
        required: true,
      },
    },
    {
      key: 'schema',
      name: 'Database Schema',
      description: 'Description of your database schema including table relationships and column descriptions',
      type: 'string',
      validation: {
        required: false,
      },
    },
    {
      key: 'instructions',
      name: 'Instructions',
      description: 'Optional instructions for processing the response',
      type: 'string',
      validation: {
        required: false,
      },
    },
    {
      key: 'maxRows',
      name: 'Maximum Rows',
      description: 'Maximum number of rows to return (default: 100)',
      type: 'string',
      validation: {
        required: false,
      },
    },
    {
      key: 'question',
      name: 'Question',
      description: 'Your database question in natural language',
      type: 'string',
      validation: {
        required: true,
      },
    },
  ],
  operation: {
    handler: handler,
  },
  outputParameters: [
    {
      key: 'response',
      name: 'Response',
      description: 'The answer to your database question',
      type: 'string',
      validation: {
        required: true,
      },
    }
  ],
};

export default actionDefinition;

export async function handler({ input }: ActionContext): Promise<OutputObject> {
  const connection = await mysql.createConnection({
    host: input.host,
    port: parseInt(input.port || '3306'),
    user: input.user,
    password: input.password,
    database: input.database,
    ssl: {
      ca: input.sslCert,
      rejectUnauthorized: false
    }
  });

  const maxRows = parseInt(input.maxRows || '100');

  try {
    const schemaInfo = input.schema || '[]';
    const sqlQuery = await generateSqlQuery(input.openaiApiKey, schemaInfo, input.question, maxRows);
    const sanitizedQuery = sanitizeSqlQuery(sqlQuery);
    
    try {
      const [rows] = await connection.query(sanitizedQuery);
      return formatResponse(rows as any[], input.instructions);
    } catch (queryError: unknown) {
      const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
      throw new Error(`Query failed. Please ensure your question uses existing table and column names. If possible, provide the database schema in the 'schema' parameter. Error: ${errorMessage}`);
    }
  } finally {
    await connection.end();
  }
}

async function generateSqlQuery(apiKey: string, schemaInfo: string, question: string, maxRows: number): Promise<string> {
  const ai = new OpenAI({ apiKey });
  
  const completion = await ai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: `You are a MySQL expert. Generate secure, read-only SQL queries based on natural language questions.
        ${schemaInfo !== '[]' ? `Schema information: ${schemaInfo}` : ''}
        
        Important: 
        - Return ONLY the raw SQL query without any formatting, markdown, or code blocks
        - NEVER assume column names exist
        - When no schema is provided or when asked for "all fields", use "SELECT *"
        - Do not invent or guess column names based on table names
        
        Rules:
        - Generate only SELECT queries (no INSERT, UPDATE, DELETE, etc.)
        - For random selection, use "ORDER BY RAND()"
        - Include relevant JOINs only if table relationships are explicitly provided
        - Add inline comments with -- to explain the query
        - Limit results using LIMIT clause`
      },
      { role: "user", content: question }
    ],
    temperature: 0
  });

  const sqlQuery = completion.choices[0]?.message?.content?.trim();
  if (!sqlQuery) {
    throw new Error('Failed to generate SQL query: No response from OpenAI');
  }

  return sqlQuery;
}

function sanitizeSqlQuery(query: string): string {
  return query
    .replace(/```sql/gi, '')
    .replace(/```/g, '')
    .replace(/--.*$/gm, '')
    .replace(/^\s*[\r\n]/gm, '')
    .replace(/^(?!SELECT\s)/i, 'SELECT ')
    .replace(/;[\s\S]*$/, ';')
    .replace(/[^;]$/, match => match + ';')
    .trim();
}

function formatResponse(rows: any[], instructions?: string): OutputObject {
  let response = JSON.stringify(rows, null, 2);
  if (instructions) {
    response = `Instructions for the following content: ${instructions}\n\n${response}`;
  }
  return { response };
}
