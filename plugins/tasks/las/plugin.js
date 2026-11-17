// SparkHub LAS adapter for New API. Credentials are supplied by the channel.
// Asset/group handles are gateway task IDs. The host resolves originTaskIds,
// checks ownership and pins the original channel before any upstream call.
const VIDEO_MODELS = ["dreamina-seedance-2-0-260128", "dreamina-seedance-2-0-fast-260128", "dreamina-seedance-2-0-mini-260615", "dreamina-seedance-2-5-260628"];
const EDIT_MODEL = "las-video-edit-enhance";
const ASSET_MODEL = "las-assets";
const TOKEN_SCHEMA = {
  tokens: { type: "number", unit: "token", description: { en: "Video generation token unit price", zh: "视频生成 Token 单价" } },
  resolution: { enum: ["480p", "720p", "1080p"], description: { en: "Output video resolution", zh: "输出视频分辨率" } },
};
export const meta = {
  apiVersion: 1,
  key: "las",
  name: "BytePlus LAS",
  version: "0.1.1",
  author: { name: "SparkHub" },
  description: { en: "BytePlus LAS video generation, editing and private reference assets", zh: "BytePlus LAS 视频生成、编辑和私有参考素材" },
  baseUrl: "https://operator.las.ap-southeast-1.bytepluses.com",
  keyHint: { en: "LAS API Key", zh: "LAS API Key" },
  models: VIDEO_MODELS.concat([EDIT_MODEL, ASSET_MODEL]),
  fetchMode: "per_task",
  channelConfig: {
    type: "object",
    properties: {
      projectName: { type: "string", title: { en: "LAS project name", zh: "LAS 项目名称" }, default: "default", maxLength: 191 },
    },
  },
  usageSchema: TOKEN_SCHEMA,
  usageExamples: [{ label: "480p · 4s", facts: { tokens: 34560, resolution: "480p" } }],
  usageProfiles: [
    { models: [ASSET_MODEL], schema: {} },
    {
      models: [EDIT_MODEL],
      schema: {
        seconds: { type: "number", unit: "second", description: { en: "Video editing unit price", zh: "视频编辑单价" } },
        preprocess_calls: { type: "number", unit: "count", description: { en: "Video preprocessing unit price", zh: "视频预处理单价" } },
      },
    },
  ],
  routes: [
    { method: "POST", path: "/las/video/tasks", type: "submit", decode: "createVideo", render: "created" },
    { method: "GET", path: "/las/video/tasks/:task_id", type: "query", render: "status" },
    { method: "POST", path: "/las/edit/tasks", type: "submit", decode: "createEdit", render: "created" },
    { method: "GET", path: "/las/edit/tasks/:task_id", type: "query", render: "status" },
    { method: "POST", path: "/las/asset-groups", type: "submit", decode: "createGroup", render: "created" },
    { method: "GET", path: "/las/asset-groups/:task_id", type: "query", render: "status" },
    { method: "POST", path: "/las/assets", type: "submit", decode: "createAsset", render: "created" },
    { method: "GET", path: "/las/assets/:task_id", type: "query", render: "status" },
    { method: "POST", path: "/las/assets/delete", type: "submit", decode: "deleteAsset", render: "created" },
  ],
  protocols: [{ name: "openai_video", models: VIDEO_MODELS }],
};
function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(name + " must be an object");
  return value;
}
function requestBody(ctx) {
  if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
  return object(ctx.body.value, "body");
}
function text(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(name + " is invalid");
  return value.trim();
}
function handle(value) {
  const id = text(value, "gateway asset handle", 128);
  if (!/^task_[A-Za-z0-9_-]+$/.test(id)) throw new Error("Use a gateway task handle, not an upstream asset ID");
  return id;
}
function mediaURL(value) {
  const url = text(value, "media URL", 8192);
  if (url.startsWith("asset://")) {
    handle(url.slice(8));
    return url;
  }
  if (!/^https:\/\/[^\s/@]+(?:[/:?#]|$)/i.test(url)) throw new Error("A public HTTPS media URL is required");
  return url;
}
function duration(value, model) {
  if (value === undefined) return model.includes("2-5") ? 30 : 15;
  const max = model.includes("2-5") ? 30 : 15;
  if (!Number.isInteger(value) || (value !== -1 && (value < 4 || value > max))) throw new Error("duration is outside the model limits");
  return value === -1 ? max : value;
}
function videoBody(value) {
  const b = object(value, "video request");
  if (!VIDEO_MODELS.includes(b.model)) throw new Error("Unsupported LAS video model");
  duration(b.duration, b.model);
  if (b.resolution !== undefined && !["480p", "720p", "1080p"].includes(b.resolution)) throw new Error("Unsupported resolution");
  if (b.model.includes("fast") && b.resolution === "1080p") throw new Error("Fast model does not support 1080p");
  if (b.callback_url !== undefined || b.draft_task_id !== undefined) throw new Error("Callbacks and draft reuse are not supported");
  if (!Array.isArray(b.content) || !b.content.length || b.content.length > 20) throw new Error("content must contain 1 to 20 parts");
  for (const flag of ["generate_audio", "watermark", "camera_fixed"]) {
    if (b[flag] !== undefined && typeof b[flag] !== "boolean") throw new Error(flag + " must be boolean");
  }
  if (b.seed !== undefined && (!Number.isInteger(b.seed) || b.seed < -1 || b.seed > 2147483647)) throw new Error("seed is invalid");
  const refs = [];
  for (const part of b.content) {
    object(part, "content part");
    if (part.type === "text") text(part.text, "prompt", 10000);
    else if (["image_url", "video_url", "audio_url"].includes(part.type)) {
      const u = mediaURL(object(part[part.type], part.type).url);
      if (u.startsWith("asset://")) refs.push(u.slice(8));
    } else throw new Error("Unsupported content type");
  }
  return {
    kind: "submit",
    model: b.model,
    action: "video",
    requestBody: Object.fromEntries(
      ["model", "content", "duration", "resolution", "ratio", "generate_audio", "watermark", "seed", "camera_fixed"]
        .filter((k) => b[k] !== undefined)
        .map((k) => [k, b[k]])
    ),
    originTaskIds: [...new Set(refs)],
  };
}
function resolveAsset(ctx, id, action) {
  const source = (ctx.originTasks || []).find((item) => item.taskId === id);
  if (!source || source.action !== action || source.status !== "SUCCESS") throw new Error("Reference is not an available owned " + action);
  return source.upstreamTaskId;
}
function rewriteReferences(ctx, value) {
  if (typeof value === "string" && value.startsWith("asset://")) return "asset://" + resolveAsset(ctx, value.slice(8), "asset");
  if (Array.isArray(value)) return value.map((item) => rewriteReferences(ctx, item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteReferences(ctx, v)]));
  return value;
}
export const native = {
  createVideo: (ctx) => videoBody(requestBody(ctx)),
  createEdit: function (ctx) {
    const b = requestBody(ctx);
    if (b.model !== EDIT_MODEL) throw new Error("model must be las-video-edit-enhance");
    const data = object(b.data, "data");
    mediaURL(data.video_url);
    text(data.user_prompt, "user_prompt", 10000);
    const template = object(data.template, "template");
    if (!["basic", "general", "replace/person_replace", "replace/subject_replace", "style_transfer/general"].includes(template.id))
      throw new Error("Unsupported edit template");
    const model = data.model || VIDEO_MODELS[0];
    if (!VIDEO_MODELS.includes(model)) throw new Error("Unsupported edit model");
    duration(data.duration, model);
    if (data.draft_task_id !== undefined || data.draft === true) throw new Error("Draft workflow is not supported");
    const refs = [];
    for (const u of [data.video_url].concat(data.image_urls || [])) {
      mediaURL(u);
      if (u.startsWith("asset://")) refs.push(u.slice(8));
    }
    return { kind: "submit", model: EDIT_MODEL, action: "edit", requestBody: { data: data }, originTaskIds: [...new Set(refs)] };
  },
  createGroup: function (ctx) {
    const b = requestBody(ctx);
    text(b.Name, "Name", 64);
    if (b.GroupType !== undefined && b.GroupType !== "AIGC") throw new Error("Only AIGC reference groups are enabled");
    if (b.Description !== undefined && (typeof b.Description !== "string" || b.Description.length > 300)) throw new Error("Description is invalid");
    return { kind: "submit", model: ASSET_MODEL, action: "asset_group", requestBody: { Name: b.Name, Description: b.Description || "", GroupType: "AIGC" } };
  },
  createAsset: function (ctx) {
    const b = requestBody(ctx);
    const group = handle(b.GroupId);
    mediaURL(b.URL);
    if (b.URL.startsWith("asset://")) throw new Error("Asset upload requires a public HTTPS URL");
    if (!["Image", "Video", "Audio"].includes(b.AssetType)) throw new Error("Unsupported AssetType");
    text(b.Name, "Name", 64);
    return {
      kind: "submit",
      model: ASSET_MODEL,
      action: "asset",
      requestBody: { GroupId: group, URL: b.URL, Name: b.Name, AssetType: b.AssetType },
      originTaskIds: [group],
    };
  },
  deleteAsset: function (ctx) {
    const id = handle(requestBody(ctx).Id);
    return { kind: "submit", model: ASSET_MODEL, action: "asset_delete", requestBody: { Id: id }, originTaskIds: [id] };
  },
  created: (ctx, task) => ({ id: task.task_id, status: task.status }),
  status: function (ctx, task) {
    const action = ctx.path.includes("/asset-groups")
      ? "asset_group"
      : ctx.path.includes("/assets/")
        ? "asset"
        : ctx.path.includes("/edit/")
          ? "edit"
          : "video";
    const result = { id: task.task_id, status: task.status, action: action, progress: task.progress, error: task.fail_reason || null };
    if (action === "asset") result.asset_url = "asset://" + task.task_id;
    // Never expose the upstream group/asset ids or project-wide directory.
    const data = task.data || {};
    if (action === "video" || action === "edit") result.content = (action === "edit" ? data.data : data)?.content || {};
    if (action === "asset") result.asset_status = data.Status || "Processing";
    return result;
  },
};
export function buildSubmitRequest(ctx) {
  let path;
  let sent;
  const b = ctx.requestBody;
  if (ctx.action === "video") {
    sent = rewriteReferences(ctx, b);
    sent.model = ctx.upstreamModel || ctx.model;
    path = "/contents/generations/tasks";
  } else if (ctx.action === "edit") {
    sent = { operator_id: "las_video_edit_enhance", operator_version: "v1", data: rewriteReferences(ctx, b.data) };
    path = "/submit";
  } else {
    const project = ctx.config?.projectName || "default";
    sent = Object.assign({}, b, { ProjectName: project });
    if (ctx.action === "asset_group") path = "/open/CreateAssetGroup";
    else if (ctx.action === "asset") {
      sent.GroupId = resolveAsset(ctx, b.GroupId, "asset_group");
      path = "/open/CreateAsset";
    } else if (ctx.action === "asset_delete") {
      sent.Id = resolveAsset(ctx, b.Id, "asset");
      path = "/open/DeleteAsset";
    } else throw new Error("Unsupported action");
  }
  return {
    url: ctx.baseUrl.replace(/\/$/, "") + "/api/v1" + path,
    method: "POST",
    headers: { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" },
    body: sent,
  };
}
export function parseSubmitResponse(ctx, resp) {
  const b = object(resp.body, "upstream response");
  if (b.error || b.ResponseMetadata?.Error || (b.metadata?.business_code && String(b.metadata.business_code) !== "0"))
    throw new Error("LAS rejected the request");
  if (ctx.action === "asset_delete")
    return { taskId: ctx.publicTaskId, taskData: { deleted: true, deleted_asset: ctx.requestBody.Id }, immediate: { status: "SUCCESS" } };
  const id = ctx.action === "edit" ? b.metadata?.task_id : b.id || b.Id;
  if (typeof id !== "string" || !id) throw new Error("LAS did not return a task ID");
  const result = { taskId: id, taskData: Object.assign({}, b, ctx.action === "asset_group" ? { Name: ctx.requestBody.Name } : {}) };
  if (ctx.action === "asset_group") result.immediate = { status: "SUCCESS" };
  return result;
}
export function buildQueryRequest(ctx) {
  const root = ctx.baseUrl.replace(/\/$/, "") + "/api/v1";
  const headers = { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" };
  if (ctx.action === "asset")
    return { url: root + "/open/GetAsset", method: "POST", headers: headers, body: { Id: ctx.taskId, ProjectName: ctx.config?.projectName || "default" } };
  if (ctx.action === "edit")
    return {
      url: root + "/poll",
      method: "POST",
      headers: headers,
      body: { operator_id: "las_video_edit_enhance", operator_version: "v1", task_id: ctx.taskId },
    };
  return { url: root + "/contents/generations/tasks/" + encodeURIComponent(ctx.taskId), method: "GET", headers: headers };
}
export function parseTaskResult(ctx, body) {
  if (ctx.action === "asset") {
    if (body.Status === "Active") return { status: "SUCCESS", progress: "100%" };
    if (body.Status === "Failed") return { status: "FAILURE", reason: "LAS asset preprocessing failed" };
    if (["Processing", "Pending", "Uploading"].includes(body.Status)) return { status: "IN_PROGRESS", progress: "50%" };
    return { status: "UNKNOWN", reason: "Unrecognized LAS asset state" };
  }
  let b = body;
  if (ctx.action === "edit") {
    const m = body.metadata || {};
    if (m.task_status === "FAILED" || (m.business_code !== undefined && String(m.business_code) !== "0"))
      return { status: "FAILURE", reason: m.business_message || "LAS editing failed" };
    if (["PENDING", "RUNNING"].includes(m.task_status)) return { status: "IN_PROGRESS", progress: "30%" };
    if (m.task_status !== "COMPLETED") return { status: "UNKNOWN", reason: "Unrecognized LAS edit state" };
    b = body.data || {};
  }
  if (b.status === "succeeded" && b.content?.video_url) return { status: "SUCCESS", progress: "100%", url: b.content.video_url };
  if (["failed", "expired", "cancelled"].includes(b.status)) return { status: "FAILURE", reason: b.error?.message || b.status };
  if (b.status === "queued") return { status: "QUEUED", progress: "10%" };
  if (b.status === "running") return { status: "IN_PROGRESS", progress: "50%" };
  return { status: "UNKNOWN", reason: "Unrecognized LAS video state" };
}
export function extractUsage(ctx) {
  if (ctx.usagePurpose === "billing_ratios" || ctx.model === ASSET_MODEL) return {};
  if (ctx.action === "edit") return { seconds: duration(ctx.requestBody.data.duration, ctx.requestBody.data.model || VIDEO_MODELS[0]), preprocess_calls: 1 };
  const b = ctx.requestBody;
  const resolution = b.resolution || "720p";
  const pixels = { "480p": 640 * 576, "720p": 1280 * 720, "1080p": 1920 * 1080 };
  // Conservative reservation; authoritative upstream tokens replace this on success.
  return { tokens: Math.ceil(((duration(b.duration, b.model) + 60) * pixels[resolution] * 24) / 1024), resolution: resolution };
}
export function extractUsageOnComplete(ctx, result, body) {
  if (ctx.model === ASSET_MODEL) return {};
  const b = ctx.action === "edit" ? body.data || {} : body;
  if (b.status !== "succeeded") return {};
  if (ctx.action === "edit") {
    const seconds = Number(b.duration);
    return Number.isFinite(seconds) && seconds > 0 && seconds <= 30 ? { seconds: seconds, preprocess_calls: 1 } : {};
  }
  const tokens = Number(b.usage?.total_tokens);
  return Number.isSafeInteger(tokens) && tokens >= 0 && tokens <= 2147483647 ? { tokens: tokens } : {};
}
export function listArtifacts(task) {
  if (task.action === "asset" && task.data?.URL) {
    const type = { Image: "image", Video: "video", Audio: "audio" }[task.data.AssetType];
    return type ? [{ key: "asset", type: type }] : [];
  }
  const data = task.action === "edit" ? task.data?.data : task.data;
  return data?.content?.video_url ? [{ key: "video", type: "video", mimeType: "video/mp4" }] : [];
}
export function buildContentRequest(ctx) {
  const data = ctx.action === "edit" ? ctx.data?.data : ctx.data;
  if (ctx.action === "asset" && ctx.artifactKey === "asset" && ctx.data?.URL)
    return { url: ctx.data.URL, method: ctx.clientRequest.method, credentialless: true };
  if (ctx.artifactKey !== "video" || !data?.content?.video_url) throw new Error("artifact_not_found");
  return { url: data.content.video_url, method: ctx.clientRequest.method, credentialless: true };
}
export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      const b = requestBody(ctx);
      const content = [{ type: "text", text: b.prompt }];
      if (b.input_reference) content.push({ type: "image_url", image_url: { url: mediaURL(b.input_reference) }, role: "first_frame" });
      return videoBody({
        model: ctx.model,
        content: content,
        duration: b.seconds === undefined ? 4 : Number(b.seconds),
        resolution: b.resolution || "480p",
        generate_audio: b.generate_audio,
        watermark: b.watermark,
        seed: b.seed,
      });
    },
    render: (ctx, task) => ({ content: task.data?.content || {} }),
  },
};
