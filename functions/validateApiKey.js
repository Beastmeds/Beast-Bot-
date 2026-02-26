import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Deno edge function to validate incoming API keys and proxy to LLM
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Invalid Authorization' }, { status: 401 });
    }
    
    const apiKey = authHeader.replace('Bearer ', '');
    const { message } = await req.json();
    
    const users = await base44.asServiceRole.entities.User.list();
    const user = users.find(u => u.api_keys?.some(k => k.key === apiKey));
    
    if (!user) return Response.json({ error: 'Invalid API key' }, { status: 401 });
    
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Beantworte: ${message}`
    });
    
    return Response.json({ success: true, response, user: user.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
