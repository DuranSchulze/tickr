package com.trackly.internal;

import android.app.DownloadManager;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.net.URI;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final Pattern REPORT_PATH = Pattern.compile(
        "/api/reports/weekly-department/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/(pdf|xlsx)"
    );
    private static final Pattern REPORT_ATTACHMENT = Pattern.compile(
        "attachment; filename=\"(weekly-[a-z0-9-]{1,60}-[0-9]{4}-[0-9]{2}-[0-9]{2}-to-[0-9]{4}-[0-9]{2}-[0-9]{2})\\.(pdf|xlsx)\""
    );

    @Override
    protected void load() {
        super.load();
        getBridge().getWebView().setDownloadListener((url, userAgent, disposition, mimeType, length) ->
            downloadWeeklyReport(url, userAgent, disposition, mimeType)
        );
    }

    static String weeklyReportFilename(String serverUrl, String url, String disposition, String mimeType) {
        if (serverUrl == null || url == null || disposition == null) return null;
        URI server = URI.create(serverUrl);
        URI request;
        try {
            request = URI.create(url);
        } catch (IllegalArgumentException exception) {
            return null;
        }
        if (server.getHost() == null || !server.getHost().equalsIgnoreCase(request.getHost())
            || !server.getScheme().equalsIgnoreCase(request.getScheme())
            || effectivePort(server) != effectivePort(request)
            || request.getRawUserInfo() != null || request.getRawQuery() != null
            || request.getRawFragment() != null || request.getRawPath() == null) {
            return null;
        }

        Matcher path = REPORT_PATH.matcher(request.getRawPath());
        Matcher attachment = REPORT_ATTACHMENT.matcher(disposition);
        if (!path.matches() || !attachment.matches() || !path.group(1).equals(attachment.group(2))) return null;
        String format = path.group(1);
        String expectedMimeType = format.equals("pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return expectedMimeType.equalsIgnoreCase(mimeType) ? attachment.group(1) + "." + format : null;
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private void downloadWeeklyReport(String url, String userAgent, String disposition, String mimeType) {
        String filename = weeklyReportFilename(getBridge().getServerUrl(), url, disposition, mimeType);
        if (filename == null) return;

        try {
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie == null || cookie.trim().isEmpty()) {
                Toast.makeText(this, R.string.report_download_failed, Toast.LENGTH_LONG).show();
                return;
            }

            // Give repeated exports distinct destinations so Android can save each copy.
            int extension = filename.lastIndexOf('.');
            String uniqueFilename = filename.substring(0, extension) + "-"
                + UUID.randomUUID().toString().substring(0, 8) + filename.substring(extension);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .addRequestHeader("Cookie", cookie)
                .setMimeType(mimeType)
                .setTitle(filename)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, uniqueFilename);
            if (userAgent != null && !userAgent.trim().isEmpty()) request.addRequestHeader("User-Agent", userAgent);

            DownloadManager manager = getSystemService(DownloadManager.class);
            if (manager == null) throw new IllegalStateException("Android Download Manager is unavailable");
            manager.enqueue(request);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException exception) {
            Toast.makeText(this, R.string.report_download_failed, Toast.LENGTH_LONG).show();
        }
    }
}
