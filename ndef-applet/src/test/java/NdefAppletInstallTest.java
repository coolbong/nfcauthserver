import com.ubivelox.UbJcre;
import com.ubivelox.javacard.JcreConfig;
import com.ubivelox.ubct.Ubct;
import com.ubivelox.ubct.controller.gp.UbCard;
import com.ubivelox.ubct.model.card.Command;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static io.github.coolbong.tlv.Hex.toBytes;
import static io.github.coolbong.tlv.Hex.toHex;
import static org.junit.Assert.assertEquals;

public class NdefAppletInstallTest {

    private final String expectedUrlTap1 = "https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=000001&mac=EA2BEDD5DDB4F744&kid=1";
    private final String expectedUrlTap2 = "https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=000002&mac=A6C5411B8D6A3807&kid=1";

    @Before
    public void setUp() {
        UbJcre jcre = UbJcre.getInstance();
        JcreConfig config = jcre.getConfig();
        config.loadConfig("config.properties");
        jcre.reset();
    }

    @Test
    public void testInstallAndReadNdefUrl() {
        // 1. Execute PERSO/01.installforinstall.txt to install NdefApplet with empty parameters
        Ubct ubct = new Ubct();
        ubct.getConfig().setUserCard("CT");
        ubct.execute("PERSO/01.installforinstall.txt");

        UbJcre jcre = UbJcre.getInstance();

        // 2. [Tap 1] SELECT NDEF Application (AID: D2760000850101)
        byte[] selectResp = jcre.transmit(toBytes("00A4040007D276000085010100"));
        Assert.assertEquals("Select NDEF Applet should succeed with 9000", "9000", toHex(selectResp));

        // 3. SELECT NDEF Data File (0xE104)
        byte[] selectFileResp = jcre.transmit(toBytes("00A4000C02E104"));
        Assert.assertEquals("Select File 0xE104 should succeed with 9000", "9000", toHex(selectFileResp));

        // 4. READ BINARY: Read NLEN (2 bytes)
        byte[] readNlenResp = jcre.transmit(toBytes("00B0000002"));
        String nlenHex = toHex(readNlenResp);
        Assert.assertTrue("Should return 9000 at end", nlenHex.endsWith("9000"));
        int nlen = Integer.parseInt(nlenHex.substring(0, 4), 16);
        Assert.assertEquals("NLEN should match 95 bytes (0x5F)", 95, nlen);

        // 5. READ BINARY: Read NDEF Record (95 bytes)
        byte[] readDataResp = jcre.transmit(toBytes("00B000025F"));
        String dataHex = toHex(readDataResp);
        Assert.assertTrue("Should return 9000 at end", dataHex.endsWith("9000"));

        byte[] payloadBytes = new byte[90];
        System.arraycopy(readDataResp, 5, payloadBytes, 0, 90);
        String urlBody = new String(payloadBytes, StandardCharsets.US_ASCII);
        String fullUrlTap1 = "https://" + urlBody;

        System.out.println("✅ [Tap 1] NDEF Applet URL: " + fullUrlTap1);
        Assert.assertEquals(expectedUrlTap1, fullUrlTap1);

        // 6. 같은 세션 내에서 다시 READ BINARY 호출 시 카운터 중복 증가 방지 검증
        byte[] readSameSessionResp = jcre.transmit(toBytes("00B000025F"));
        System.arraycopy(readSameSessionResp, 5, payloadBytes, 0, 90);
        String sameSessionUrl = "https://" + new String(payloadBytes, StandardCharsets.US_ASCII);
        System.out.println("✅ [Same Session] NDEF Applet URL: " + sameSessionUrl);
        Assert.assertEquals("Same session should keep counter at 000001", expectedUrlTap1, sameSessionUrl);

        // 7. [Tap 2] 새로운 세션 (Applet re-selection)
        selectResp = jcre.transmit(toBytes("00A4040007D276000085010100"));
        Assert.assertEquals("9000", toHex(selectResp));

        selectFileResp = jcre.transmit(toBytes("00A4000C02E104"));
        Assert.assertEquals("9000", toHex(selectFileResp));

        byte[] readDataResp2 = jcre.transmit(toBytes("00B000025F"));
        System.arraycopy(readDataResp2, 5, payloadBytes, 0, 90);
        String fullUrlTap2 = "https://" + new String(payloadBytes, StandardCharsets.US_ASCII);
        System.out.println("✅ [Tap 2] NDEF Applet URL: " + fullUrlTap2);
        Assert.assertEquals("Next tap session should increment counter to 000002", expectedUrlTap2, fullUrlTap2);
    }

    @Test
    public void testInstallWithEmptyParametersUsesDefaultUrl() {
        UbJcre jcre = UbJcre.getInstance();

        // 1. Authenticate with ISD
        jcre.transmit(toBytes("80500000081122334455667788"));
        // Install via script with empty param
        Ubct ubct = new Ubct();
        ubct.getConfig().setUserCard("CT");
        ubct.execute("PERSO/01.installforinstall.txt");

        UbCard usercard = ubct.getUserCard();
        Command cmd = usercard.sendApdu("00A4040007D276000085010100");
        assertEquals("9000", cmd.getSw());

        cmd = usercard.sendApdu("00A4000C02E104");
        assertEquals("9000", cmd.getSw());

        cmd = usercard.sendApdu("00B000025F");
        assertEquals("9000", cmd.getSw());

        byte[] resp = toBytes(cmd.getResp());
        byte[] payloadBytes = new byte[90];
        System.arraycopy(resp, 5, payloadBytes, 0, 90);
        String fullUrl = "https://" + new String(payloadBytes, StandardCharsets.US_ASCII);
        System.out.println("✅ Empty install param URL: " + fullUrl);
        Assert.assertEquals(expectedUrlTap1, fullUrl);
    }
}
