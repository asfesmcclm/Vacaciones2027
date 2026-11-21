export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink: string;
}

export async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  mimeType: string,
  blob: Blob,
  description: string
): Promise<DriveUploadResult> {
  const metadata = {
    name: fileName,
    description,
    mimeType,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', blob);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    let message = `Error ${res.status} al archivar en Google Drive`;
    try {
      const json = await res.json();
      message = json?.error?.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    webViewLink:
      data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}
