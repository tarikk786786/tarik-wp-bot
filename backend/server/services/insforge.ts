import dotenv from 'dotenv';
dotenv.config();

const rawUrl = process.env.INSFORGE_URL;
const url = (rawUrl && rawUrl.trim().length > 0) ? rawUrl : 'https://mkrrq64u.us-east.insforge.app';
const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
const key = process.env.INSFORGE_KEY || 'ik_8e4591ffe92f43534d3c6456f980a230';

if (!key) {
  console.warn('INSFORGE_KEY is not set in environment variables. Database operations will fail.');
}

class QueryBuilder implements PromiseLike<any> {
  constructor(private table: string) {}
  private method: string = 'GET';
  private params = new URLSearchParams();
  private bodyData: any = null;
  private isSingle = false;
  private headers: Record<string, string> = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  select(columns: string) { this.method = 'GET'; this.params.set('select', columns); return this; }
  insert(data: any) { this.method = 'POST'; this.bodyData = data; return this; }
  upsert(data: any, opts?: any) {
    this.method = 'POST';
    this.bodyData = data;
    this.headers['Prefer'] = 'resolution=merge-duplicates';
    if (opts?.onConflict) this.params.set('on_conflict', opts.onConflict);
    return this;
  }
  update(data: any) { this.method = 'PATCH'; this.bodyData = data; return this; }
  delete() { this.method = 'DELETE'; return this; }
  eq(col: string, val: any) { this.params.append(col, `eq.${val}`); return this; }
  neq(col: string, val: any) { this.params.append(col, `neq.${val}`); return this; }
  lt(col: string, val: any) { this.params.append(col, `lt.${val}`); return this; }
  single() { return this.maybeSingle(); }
  order(col: string, opts?: { ascending?: boolean }) {
    this.params.append('order', `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }
  range(from: number, to: number) {
    this.headers['Range-Unit'] = 'items';
    this.headers['Range'] = `${from}-${to}`;
    return this;
  }
  maybeSingle() {
    this.isSingle = true;
    this.headers['Accept'] = 'application/vnd.pgrst.object+json';
    return this;
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const fullUrl = `${cleanUrl}/api/database/records/${this.table}${this.params.toString() ? '?' + this.params.toString() : ''}`;
    
    return fetch(fullUrl, { 
      method: this.method, 
      headers: this.headers, 
      body: this.bodyData ? JSON.stringify(this.bodyData) : undefined 
    })
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 406 && this.isSingle) {
          return { data: null, error: null };
        }
        throw new Error(await response.text());
      }
      const text = await response.text();
      return { data: text ? JSON.parse(text) : null, error: null };
    })
    .catch(error => {
      return { data: null, error };
    })
    .then(onfulfilled, onrejected);
  }
}

export const insforge = {
  database: {
    from: (table: string) => new QueryBuilder(table)
  }
};
