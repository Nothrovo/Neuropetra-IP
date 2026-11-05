import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import DatabasePage from '../app/settings/database/page';
it('renders real scoped workflow, no SQL console and explicit one-run retention limitation',()=>{
 const html=renderToStaticMarkup(<DatabasePage/>);
 for(const text of ['Database Management','Test connection','Browse owned reputation','UTC cutoff','Preview','Administrator password','Typed confirmation','one-run','No shared telemetry'])expect(html).toContain(text);
 expect(html).not.toMatch(/textarea|postgres:\/\/|localStorage/);
});
