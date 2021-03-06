import { Buffer } from 'buffer';
import { parse } from 'url';
import Http from 'http';
import Https from 'https';
import { buildClientSchema, GraphQLSchema } from 'graphql';
import { introspectionQuery } from 'graphql/utilities';
import { SchemaManager } from './schema-manager';
import { SchemaManagerHost } from './types';

const INTROSPECTION_QUERY_BODY = JSON.stringify({
  query: introspectionQuery,
});

const INTROSPECTION_QUERY_LENGTH = Buffer.byteLength(INTROSPECTION_QUERY_BODY);

export interface HttpSchemaManagerOptions {
  url: string;
  method?: 'POST'; // TODO
  headers?: { [key: string]: string };
}

export class HttpSchemaManager extends SchemaManager {
  static request(options: HttpSchemaManagerOptions) {
    const headers: { [key: string]: string | number } = {
      'Content-Type': 'application/json',
      'Content-Length': INTROSPECTION_QUERY_LENGTH,
      'User-Agent': 'ts-graphql-plugin',
      ...options.headers,
    };
    return new Promise<GraphQLSchema>((resolve, reject) => {
      const uri = parse(options.url);
      let body = '';
      const { method } = options;
      const { hostname, protocol, path } = uri;
      const requester = protocol === 'https:' ? Https.request : Http.request;
      const port = uri.port && Number.parseInt(uri.port, 10);
      const reqParam = { hostname, protocol, path, port, headers, method };
      const req = requester(reqParam, res => {
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode > 300) {
            reject({
              statusCode: res.statusCode,
              body,
            });
          } else {
            let result: any;
            try {
              result = JSON.parse(body);
              resolve(buildClientSchema(result.data));
            } catch (e) {
              reject(e);
            }
          }
        });
      });
      req.on('error', reason => reject(reason));
      req.write(INTROSPECTION_QUERY_BODY);
      req.end();
    });
  }

  private _schema: any = null;

  constructor(_host: SchemaManagerHost, private _options: HttpSchemaManagerOptions) {
    super(_host);
  }

  getBaseSchema() {
    return this._schema;
  }

  async waitBaseSchema() {
    try {
      return await HttpSchemaManager.request(this._options);
    } catch (error) {
      return null;
    }
  }

  startWatch(interval: number = 1000) {
    const request = (backoff = interval) => {
      HttpSchemaManager.request(this._options)
        .then(data => {
          this.log(`Fetch schema data from ${this._options.url}.`);
          if (data) {
            this._schema = data;
            this.emitChange();
          }
          setTimeout(request, interval);
        })
        .catch(reason => {
          this.log(`Fail to fetch schema data from ${this._options.url} via:`);
          this.log(`${JSON.stringify(reason, null, 2)}`);
          setTimeout(request, backoff * 2.0);
        });
    };
    request();
  }
}
