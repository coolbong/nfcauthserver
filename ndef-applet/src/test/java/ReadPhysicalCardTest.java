import javax.smartcardio.*;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class ReadPhysicalCardTest {
    public static void main(String[] args) {
        try {
            TerminalFactory factory = TerminalFactory.getDefault();
            List<CardTerminal> terminals = factory.terminals().list();
            System.out.println("Available terminals: " + terminals);

            CardTerminal targetTerminal = null;
            for (CardTerminal t : terminals) {
                if (t.getName().contains("5422CL") || t.getName().contains("5422")) {
                    targetTerminal = t;
                    if (t.getName().contains("5422CL")) break;
                }
            }

            if (targetTerminal == null) {
                System.out.println("OMNIKEY 5422 reader not found!");
                return;
            }

            System.out.println("Using terminal: " + targetTerminal.getName());
            if (!targetTerminal.isCardPresent()) {
                System.out.println("No card present on " + targetTerminal.getName());
                return;
            }

            Card card = targetTerminal.connect("*");
            System.out.println("Card ATR: " + bytesToHex(card.getATR().getBytes()));
            CardChannel channel = card.getBasicChannel();

            // 1. SELECT NDEF Applet (D2760000850101)
            CommandAPDU selectApplet = new CommandAPDU(hexToBytes("00A4040007D276000085010100"));
            ResponseAPDU resp = channel.transmit(selectApplet);
            System.out.println("SELECT Applet SW: " + Integer.toHexString(resp.getSW()));

            // 2. SELECT File 0xE104
            CommandAPDU selectFile = new CommandAPDU(hexToBytes("00A4000C02E104"));
            resp = channel.transmit(selectFile);
            System.out.println("SELECT File 0xE104 SW: " + Integer.toHexString(resp.getSW()));

            // 3. READ BINARY NLEN (2 bytes)
            CommandAPDU readNlen = new CommandAPDU(hexToBytes("00B0000002"));
            resp = channel.transmit(readNlen);
            System.out.println("READ NLEN: " + bytesToHex(resp.getData()) + " (SW: " + Integer.toHexString(resp.getSW()) + ")");

            // 4. READ BINARY NDEF Data (95 bytes)
            CommandAPDU readData = new CommandAPDU(hexToBytes("00B000025F"));
            resp = channel.transmit(readData);
            byte[] data = resp.getData();
            System.out.println("READ NDEF Data (SW: " + Integer.toHexString(resp.getSW()) + ")");

            if (data.length >= 5) {
                byte[] payload = new byte[data.length - 5];
                System.arraycopy(data, 5, payload, 0, payload.length);
                String url = "https://" + new String(payload, StandardCharsets.US_ASCII);
                System.out.println("================================================================================");
                System.out.println("🎉 실제 실물 카드에서 읽어온 NDEF Authentication URL:");
                System.out.println(url);
                System.out.println("================================================================================");
            }

            card.disconnect(false);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02X", b));
        }
        return sb.toString();
    }

    private static byte[] hexToBytes(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            bytes[i / 2] = (byte) Integer.parseInt(hex.substring(i, i + 2), 16);
        }
        return bytes;
    }
}
