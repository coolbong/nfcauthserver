import com.ubivelox.VirtualCardServer;
import com.ubivelox.ci.UbReaderManager;
import com.ubivelox.ubct.Ubct;
import com.ubivelox.ubct.controller.gp.UbCard;
import com.ubivelox.ubct.controller.gp.UbGp;
import com.ubivelox.ubct.model.card.Command;
import io.github.coolbong.tlv.Hex;
import io.github.coolbong.tlv.Tlv;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import static io.github.coolbong.tlv.Hex.toBytes;
import static io.github.coolbong.tlv.Hex.toHex;
import static java.lang.Thread.sleep;
import static org.junit.Assert.*;

/**
 */
public class PivVirtualCardServer extends VirtualCardServer {

    public static void main(String[] args) {
        PivVirtualCardServer server = new PivVirtualCardServer();
        server.start();
    }

    @Override
    protected void printBanner() {
        System.out.println("================================================================================");
        System.out.println("   NDEF Virtual PC/SC Card Server (상시 대기 데몬)");
        System.out.println("   - Windows Virtual Smart Card Driver & JCRE Real-Time Communication");
        System.out.println("================================================================================");
    }

    @Override
    protected void installApplet() {
        System.out.println("[단계 2/3]  NDEF 애플릿 인스턴스 생성 및 설치 중 (installforinstall)...");
        Ubct ubct = new Ubct();
        ubct.getConfig().setUserCard("CT");
        try {
            sleep(200);
        } catch (Exception e) {}
        ubct.execute("PERSO/01.installforinstall.txt");
        System.out.println(">> NDEF 애플릿이 성공적으로 설치되었습니다.\n");
    }

}
