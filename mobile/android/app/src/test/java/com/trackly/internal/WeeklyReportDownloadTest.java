package com.trackly.internal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class WeeklyReportDownloadTest {
    private static final String ORIGIN = "https://trackly.example";
    private static final String SERVER = ORIGIN + "/app/time-tracker";
    private static final String REPORT = "/api/reports/weekly-department/44c84a46-5d81-4e66-a5a8-929714565abb/";
    private static final String FILENAME = "weekly-operations-2026-11-08-to-2026-11-14";
    private static final String PDF = "application/pdf";
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    @Test
    public void acceptsBothReportFormatsFromTheConfiguredOrigin() {
        assertEquals(FILENAME + ".pdf", MainActivity.weeklyReportFilename(
            SERVER, ORIGIN + REPORT + "pdf", attachment(FILENAME + ".pdf"), PDF
        ));
        assertEquals(FILENAME + ".xlsx", MainActivity.weeklyReportFilename(
            SERVER, ORIGIN + ":443" + REPORT + "xlsx", attachment(FILENAME + ".xlsx"), XLSX
        ));
    }

    @Test
    public void rejectsRequestsOutsideTheConfiguredOriginAndReportEndpoint() {
        String disposition = attachment(FILENAME + ".pdf");
        for (String url : new String[] {
            "https://other.example" + REPORT + "pdf",
            "http://trackly.example" + REPORT + "pdf",
            ORIGIN + ":444" + REPORT + "pdf",
            ORIGIN + "/another-file.pdf",
            ORIGIN + REPORT + "pdf?redirect=elsewhere",
        }) {
            assertNull(MainActivity.weeklyReportFilename(SERVER, url, disposition, PDF));
        }
    }

    @Test
    public void rejectsUnexpectedNamesAndFormats() {
        assertNull(MainActivity.weeklyReportFilename(SERVER, ORIGIN + REPORT + "pdf", attachment("../report.pdf"), PDF));
        assertNull(MainActivity.weeklyReportFilename(SERVER, ORIGIN + REPORT + "pdf", attachment(FILENAME + ".xlsx"), XLSX));
        assertNull(MainActivity.weeklyReportFilename(SERVER, ORIGIN + REPORT + "pdf", attachment(FILENAME + ".pdf"), "text/html"));
    }

    private static String attachment(String filename) {
        return "attachment; filename=\"" + filename + "\"";
    }
}
