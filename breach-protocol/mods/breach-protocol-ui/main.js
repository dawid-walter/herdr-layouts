// Breach Protocol shared assets: fonts/ (Rajdhani, Chakra Petch, IBM Plex Mono, with their OFL files),
// art/ (hero background, chip-city loop, netrunner scenes) and sounds/ (ICE, BREACH OK).
// The breach-protocol layout loads the fonts from this folder; the other breach-protocol-* mods
// read their art and sounds from here. This mod draws nothing itself.
import { View, div } from "gpui-kit";

export default class BreachProtocolUi extends View {
  render() {
    return div();
  }
}
