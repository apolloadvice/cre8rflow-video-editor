import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock handler for cutClip endpoint
  http.post('/api/timeline/cut', () =>
    HttpResponse.json({
      success: true,
      message: 'Clip cut successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for trimClip endpoint
  http.post('/api/timeline/trim', () =>
    HttpResponse.json({
      success: true,
      message: 'Clip trimmed successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for joinClips endpoint
  http.post('/api/timeline/join', () =>
    HttpResponse.json({
      success: true,
      message: 'Clips joined successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for removeClip endpoint
  http.post('/api/timeline/remove_clip', () =>
    HttpResponse.json({
      success: true,
      message: 'Clip removed successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for addText endpoint
  http.post('/api/timeline/add_text', () =>
    HttpResponse.json({
      success: true,
      message: 'Text added successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for overlayAsset endpoint
  http.post('/api/timeline/overlay', () =>
    HttpResponse.json({
      success: true,
      message: 'Asset overlayed successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for fadeClip endpoint
  http.post('/api/timeline/fade', () =>
    HttpResponse.json({
      success: true,
      message: 'Fade applied successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for groupCut endpoint
  http.post('/api/timeline/group_cut', () =>
    HttpResponse.json({
      success: true,
      message: 'Group cut applied successfully',
      timeline: { /* mock timeline data */ },
    }, { status: 200 })
  ),
  // Mock handler for generatePreview endpoint
  http.post('/api/preview', async ({ request }) => {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    if (body && typeof body === 'object' && !('timeline' in body)) {
      return HttpResponse.json({ detail: "Missing timeline" }, { status: 400 });
    }
    // Simulate success
    return new Response(new Blob(["mock video data"], { type: "video/mp4" }), {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' }
    });
  }),
  // Mock handler for exportVideo endpoint
  http.post('/api/export', async ({ request }) => {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    // Simulate error if timeline is missing
    if (body && typeof body === 'object' && !('timeline' in body)) {
      return HttpResponse.json({ detail: "Missing timeline" }, { status: 400 });
    }
    // Extract quality param from request.url
    const reqUrl = new URL(request.url, 'http://localhost');
    const quality = reqUrl.searchParams.get('quality');
    if (quality === 'fail') {
      return HttpResponse.json({ detail: "Server error" }, { status: 500 });
    }
    // Simulate success
    return new Response(new Blob(["mock export data"], { type: "video/mp4" }), {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' }
    });
  }),
  // Add more handlers for other endpoints as needed
]; 